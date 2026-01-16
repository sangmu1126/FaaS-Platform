import { request } from 'undici';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import FormData from 'form-data';

export const proxyService = {

    // Smart Upload with Runtime Optimization
    async uploadFunction(file, runtime, functionId, memoryMb, functionName, envVars) {
        const targetUrl = `${config.awsAlbUrl}/upload`;

        // 1. Runtime Optimization Logic
        let contentType = 'application/octet-stream';
        let filename = file.originalname;

        if (runtime === 'python') {
            contentType = config.runtimes.python.contentType;
        } else if (runtime === 'cpp') {
            contentType = config.runtimes.cpp.contentType;
        }

        // 2. Construct FormData (using form-data package)
        const formData = new FormData();
        formData.append('file', file.buffer, { filename, contentType });
        if (envVars) {
            formData.append('envVars', envVars);
        }

        // 3. Get FormData as Buffer (synchronous, avoids stream issues)
        const formDataBuffer = formData.getBuffer();

        // Headers for ALB Controller
        const headers = {
            'x-runtime': runtime,
            'x-memory-mb': memoryMb ? memoryMb.toString() : '128',
            'x-api-key': config.infraApiKey,
            ...formData.getHeaders(),
            'Content-Length': formDataBuffer.length
        };

        // Forward function name if provided
        if (functionName) {
            headers['x-function-name'] = encodeURIComponent(functionName);
        }

        // 4. Send using undici.request with Buffer body
        logger.info(`Proxying Upload to ${targetUrl}`, { runtime, contentType, size: formDataBuffer.length });

        const { statusCode, body } = await request(targetUrl, {
            method: 'POST',
            headers,
            body: formDataBuffer
        });

        if (statusCode >= 400) {
            const text = await body.text();
            throw new Error(`ALB returned ${statusCode}: ${text}`);
        }

        return await body.json();
    },

    // Proxy Execution
    async runFunction(functionId, inputData, options = {}) {
        const targetUrl = `${config.awsAlbUrl}/run`;

        logger.info(`Proxying RUN to ${targetUrl}`, { functionId, headers: options.headers });

        try {
            const { statusCode, body } = await request(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': config.infraApiKey,
                    ...(options.headers || {})
                },
                body: JSON.stringify({ functionId, inputData }),
                bodyTimeout: 60000,  // 60 seconds for function execution
                headersTimeout: 30000  // 30 seconds to get initial response
            });

            const result = await body.json();

            // If ALB is down or 500, we treat result as error
            if (statusCode >= 400) {
                result.error = result.error || "Upstream Error";
                result.status = "ERROR";
                result.statusCode = statusCode; // Propagate status code
            }

            return result;
        } catch (error) {
            logger.error('Run Function Proxy Error', error);
            return {
                error: error.message || 'Connection to AWS failed',
                status: 'ERROR'
            };
        }
    },

    // Generic Proxy (GET)
    async fetch(path) {
        const targetUrl = `${config.awsAlbUrl}${path}`;
        const { body } = await request(targetUrl, {
            headers: { 'x-api-key': config.infraApiKey }
        });
        try {
            return await body.json();
        } catch (e) {
            return { error: "Failed to parse JSON from upstream" };
        }
    },

    // Fetch Raw Text (for Prometheus metrics)
    async fetchRaw(path) {
        const targetUrl = `${config.awsAlbUrl}${path}`;
        const { body } = await request(targetUrl, {
            headers: { 'x-api-key': config.infraApiKey }
        });
        return await body.text();
    },

    // DELETE Function
    async deleteFunction(functionId) {
        const targetUrl = `${config.awsAlbUrl}/functions/${functionId}`;
        logger.info(`Proxying DELETE to ${targetUrl}`);

        const { statusCode, body } = await request(targetUrl, {
            method: 'DELETE',
            headers: { 'x-api-key': config.infraApiKey }
        });

        if (statusCode >= 400) {
            const text = await body.text();
            throw new Error(`ALB returned ${statusCode}: ${text}`);
        }

        try {
            return await body.json();
        } catch (e) {
            return { success: true, message: 'Function deleted' };
        }
    },

    // UPDATE Function (PUT)
    async updateFunction(functionId, updateData) {
        const targetUrl = `${config.awsAlbUrl}/functions/${functionId}`;
        logger.info(`Proxying PUT to ${targetUrl}`, updateData);

        const { statusCode, body } = await request(targetUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.infraApiKey
            },
            body: JSON.stringify(updateData)
        });

        if (statusCode >= 400) {
            const text = await body.text();
            throw new Error(`ALB returned ${statusCode}: ${text}`);
        }

        return await body.json();
    },

    // GET Metrics for a function
    async getMetrics(functionId) {
        const targetUrl = `${config.awsAlbUrl}/functions/${functionId}/metrics`;
        const { statusCode, body } = await request(targetUrl, {
            headers: { 'x-api-key': config.infraApiKey }
        });

        // If not supported by AWS Controller, return empty metrics
        if (statusCode === 404) {
            return {
                executions: 0,
                avgResponseTime: 0,
                coldStarts: 0,
                errors: 0
            };
        }

        try {
            return await body.json();
        } catch (e) {
            return { error: "Failed to parse metrics" };
        }
    },

    // GET Worker Health Check
    async fetchWorkerHealth() {
        // Now we fetch status from Controller which aggregates worker heartbeats
        const status = await this.fetch('/system/status');

        // Controller returns: { status, uptime, worker: { count, pools, activeJobs, details } }
        if (status && status.status === 'online') {
            const workerCount = status.worker?.count || status.worker_count || 0;
            const workerPools = status.worker?.pools || status.pools || {};
            const activeJobs = status.worker?.activeJobs || status.active_jobs || 0;

            return {
                status: workerCount > 0 ? 'online' : 'degraded',
                uptime_seconds: status.uptime || status.uptime_seconds || 0,
                active_workers: workerCount,
                active_jobs: activeJobs,
                pools: workerPools
            };
        }
        return { status: 'unknown', pools: {} };
    },

    // Parse Prometheus text format and extract metrics
    parsePrometheusMetrics(text, functionId = null) {
        const lines = text.split('\n');
        const metrics = {
            global: {
                totalInvocations: 0,
                totalDurationSum: 0,
                totalDurationCount: 0,
                errorCount: 0
            },
            byFunction: {}
        };

        lines.forEach(line => {
            if (line.startsWith('#') || !line.trim()) return;

            // Parse function_invocations_total{functionId="...",status="..."}
            const invMatch = line.match(/function_invocations_total\{functionId="([^"]+)"(?:,status="([^"]+)")?\}\s+([\d.]+)/);
            if (invMatch) {
                const fid = invMatch[1];
                const status = invMatch[2] || 'SUCCESS';
                const count = parseFloat(invMatch[3]);

                if (!metrics.byFunction[fid]) {
                    metrics.byFunction[fid] = { invocations: 0, durationSum: 0, durationCount: 0, errors: 0 };
                }
                metrics.byFunction[fid].invocations += count;
                metrics.global.totalInvocations += count;

                if (status === 'ERROR') {
                    metrics.byFunction[fid].errors += count;
                    metrics.global.errorCount += count;
                }
            }

            // Parse function_duration_seconds_sum{functionId="..."}
            const durSumMatch = line.match(/function_duration_seconds_sum\{functionId="([^"]+)"[^}]*\}\s+([\d.]+)/);
            if (durSumMatch) {
                const fid = durSumMatch[1];
                const sum = parseFloat(durSumMatch[2]);

                if (!metrics.byFunction[fid]) {
                    metrics.byFunction[fid] = { invocations: 0, durationSum: 0, durationCount: 0, errors: 0 };
                }
                metrics.byFunction[fid].durationSum += sum;
                metrics.global.totalDurationSum += sum;
            }

            // Parse function_duration_seconds_count{functionId="..."}
            const durCountMatch = line.match(/function_duration_seconds_count\{functionId="([^"]+)"[^}]*\}\s+([\d.]+)/);
            if (durCountMatch) {
                const fid = durCountMatch[1];
                const count = parseFloat(durCountMatch[2]);

                if (!metrics.byFunction[fid]) {
                    metrics.byFunction[fid] = { invocations: 0, durationSum: 0, durationCount: 0, errors: 0 };
                }
                metrics.byFunction[fid].durationCount += count;
                metrics.global.totalDurationCount += count;
            }

            // Fallback: Parse http_request_duration_seconds for /run endpoint
            // This captures average function execution time from HTTP request duration
            const httpDurSumMatch = line.match(/http_request_duration_seconds_sum\{[^}]*route="\/run[^"]*"[^}]*status_code="200"\}\s+([\d.]+)/);
            if (httpDurSumMatch && metrics.global.totalDurationSum === 0) {
                metrics.global.totalDurationSum += parseFloat(httpDurSumMatch[1]);
            }

            const httpDurCountMatch = line.match(/http_request_duration_seconds_count\{[^}]*route="\/run[^"]*"[^}]*status_code="200"\}\s+([\d.]+)/);
            if (httpDurCountMatch && metrics.global.totalDurationCount === 0) {
                metrics.global.totalDurationCount += parseFloat(httpDurCountMatch[1]);
            }
        });

        // If functionId specified, return that function's metrics
        if (functionId && metrics.byFunction[functionId]) {
            const fn = metrics.byFunction[functionId];
            const avgDurationMs = fn.durationCount > 0 ? (fn.durationSum / fn.durationCount) * 1000 : 0;
            const successRate = fn.invocations > 0 ? ((fn.invocations - fn.errors) / fn.invocations) * 100 : 100;

            return {
                invocations: fn.invocations,
                avgDuration: Math.round(avgDurationMs),
                errors: fn.errors,
                successRate: Math.round(successRate * 100) / 100
            };
        }

        // If functionId specified but no data found, return zeros to trigger fallback
        if (functionId) {
            return {
                invocations: 0,
                avgDuration: 0,
                errors: 0,
                successRate: 100
            };
        }

        // Return global metrics with per-function breakdown
        const avgDurationMs = metrics.global.totalDurationCount > 0
            ? (metrics.global.totalDurationSum / metrics.global.totalDurationCount) * 1000
            : 0;
        const successRate = metrics.global.totalInvocations > 0
            ? ((metrics.global.totalInvocations - metrics.global.errorCount) / metrics.global.totalInvocations) * 100
            : 100;

        return {
            totalInvocations: metrics.global.totalInvocations,
            avgDuration: Math.round(avgDurationMs),
            errorCount: metrics.global.errorCount,
            successRate: Math.round(successRate * 100) / 100,
            byFunction: Object.entries(metrics.byFunction).map(([fid, data]) => ({
                functionId: fid,
                invocations: data.invocations,
                avgDuration: data.durationCount > 0 ? Math.round((data.durationSum / data.durationCount) * 1000) : 0,
                errors: data.errors,
                successRate: data.invocations > 0 ? Math.round(((data.invocations - data.errors) / data.invocations) * 10000) / 100 : 100
            }))
        };
    },

    // Get parsed metrics for a specific function from Prometheus
    async getPrometheusMetricsForFunction(functionId) {
        try {
            const promText = await this.fetchRaw('/metrics');
            return this.parsePrometheusMetrics(promText, functionId);
        } catch (e) {
            logger.warn('Failed to fetch Prometheus metrics', { error: e.message });
            return {
                invocations: 0,
                avgDuration: 0,
                errors: 0,
                successRate: 100
            };
        }
    },

    // Get all parsed Prometheus metrics
    async getAllPrometheusMetrics() {
        try {
            const promText = await this.fetchRaw('/metrics');
            return this.parsePrometheusMetrics(promText);
        } catch (e) {
            logger.warn('Failed to fetch Prometheus metrics', { error: e.message });
            return {
                totalInvocations: 0,
                avgDuration: 0,
                errorCount: 0,
                successRate: 100,
                byFunction: []
            };
        }
    }
};
