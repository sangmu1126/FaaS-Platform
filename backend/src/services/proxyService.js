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

        // Transform to expected format if needed, or just return
        if (status && status.worker) {
            return {
                status: status.worker.count > 0 ? 'online' : 'degraded',
                uptime_seconds: status.uptime,
                active_workers: status.worker.count,
                pools: status.worker.pools
            };
        }
        return { status: 'unknown' };
    }
};
