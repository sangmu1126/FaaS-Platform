import { proxyService } from '../services/proxyService.js';
import { telemetryService } from '../services/telemetryService.js';
import { slackService } from '../services/slackService.js';
import { logger } from '../utils/logger.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Track active load test process
let loadTestProcess = null;
let loadTestStatus = { running: false, startedAt: null, pid: null };

export const gatewayController = {

    // POST /loadtest/start (or /debug/loadtest)
    async startLoadTest(req, res) {
        // If already running, reject
        if (loadTestProcess && loadTestStatus.running) {
            return res.status(409).json({ error: 'Load test already running', pid: loadTestStatus.pid });
        }

        const { mode = 'capacity', duration = 10 } = req.body;
        // Mode-specific VU defaults: Resiliency=10 (stable), Capacity=200 (stress)
        const defaultConcurrency = mode === 'capacity' ? 200 : 5;
        const concurrency = req.body.concurrency || defaultConcurrency;
        logger.info(`Starting Load Test (${mode} mode)...`);

        // Helper: Stream Output
        if (!res.headersSent) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Transfer-Encoding', 'chunked');
        }
        const stream = (msg) => res.write(msg + '\n');

        let targetFunctionId = null;
        let isTempFunction = true; // Always auto-deploy now

        try {
            // 1. Select Function Source
            const functionFile = mode === 'capacity'
                ? 'hello_world.py'
                : 'cpu_stress.py';
            const functionName = `loadtest-${mode}-${Date.now()}`;

            stream(`⚡ Mode: ${mode === 'capacity' ? 'Capacity Planning' : 'Resiliency Testing'}`);

            if (mode === 'capacity') {
                stream('ℹ️  Target: System Ingress & Throughput');
                stream('ℹ️  Logic: Auto-deploys a lightweight function (Hello World) to flood the Gateway.');
                stream('ℹ️  Goal: Verify maximum request acceptance rate (RPS) of the architecture.');
            } else {
                stream('ℹ️  Target: Worker Stability & Scaling');
                stream('ℹ️  Logic: Auto-deploys a CPU-intensive function (Factorial) to stress Worker nodes.');
                stream('ℹ️  Goal: Verify resource isolation, timeouts, and error handling under load.');
            }

            stream(`📦 Deploying temporary function: ${functionName}`);

            // 2. Create ZIP from function file
            const fs = await import('fs');
            const archiver = (await import('archiver')).default;
            const os = await import('os');

            const sourceFile = path.join(__dirname, `../../scripts/loadtest_functions/${functionFile}`);
            const zipPath = path.join(os.tmpdir(), `${functionName}.zip`);

            // Create zip
            await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', resolve);
                archive.on('error', reject);

                archive.pipe(output);
                archive.file(sourceFile, { name: 'main.py' });
                archive.finalize();
            });

            stream('✅ ZIP created');

            // 3. Deploy using proxyService
            const zipBuffer = fs.readFileSync(zipPath);
            const mockFile = {
                buffer: zipBuffer,
                originalname: `${functionName}.zip`,
                mimetype: 'application/zip'
            };

            const deployResult = await proxyService.uploadFunction(mockFile, 'python', null, '128', functionName, '{}');
            targetFunctionId = deployResult.functionId;

            stream(`✅ Deployed: ${targetFunctionId}`);

            // Cleanup temp zip
            fs.unlinkSync(zipPath);

            // 4. Wait for function to be ready
            stream('⏳ Waiting for function to be ready...');
            await new Promise(r => setTimeout(r, 2000));

            // 5. Run stress test
            stream('🚀 Starting load test...');
            const scriptPath = path.join(__dirname, '../../scripts/stress_test.js');
            const env = {
                ...process.env,
                INFRA_API_KEY: process.env.INFRA_API_KEY || 'test-api-key',
                LOAD_TEST_MODE: mode,
                TARGET_FUNCTION_ID: targetFunctionId,
                LOAD_TEST_DURATION: duration.toString(),
                LOAD_TEST_CONCURRENCY: concurrency.toString()
            };

            // Determine Target (Always use Controller directly for load tests)
            let loadTestHost = 'localhost';
            let loadTestPort = '8080';

            if (process.env.AWS_ALB_URL) {
                try {
                    const url = new URL(process.env.AWS_ALB_URL);
                    loadTestHost = url.hostname;
                    loadTestPort = url.port || (url.protocol === 'https:' ? '443' : '80');
                    if (mode === 'capacity') {
                        stream(`ℹ️  Targeting Controller directly: ${loadTestHost}:${loadTestPort} (Bypassing Gateway)`);
                    } else {
                        stream(`ℹ️  Targeting Controller: ${loadTestHost}:${loadTestPort} (Full Stack via SQS)`);
                    }
                } catch (e) {
                    stream(`⚠️  Could not parse AWS_ALB_URL, falling back to localhost: ${e.message}`);
                }
            } else {
                stream(`ℹ️  Targeting localhost:8080 (AWS_ALB_URL not set)`);
            }

            const child = spawn('node', [scriptPath], {
                env: {
                    ...env,
                    LOAD_TEST_TARGET_HOST: loadTestHost,
                    LOAD_TEST_TARGET_PORT: loadTestPort
                }
            });
            loadTestProcess = child;
            loadTestStatus = { running: true, startedAt: new Date().toISOString(), pid: child.pid, mode };

            child.stdout.on('data', (data) => res.write(data));
            child.stderr.on('data', (data) => res.write(data));

            child.on('close', async (code) => {
                loadTestProcess = null;
                loadTestStatus = { running: false, startedAt: null, pid: null, lastExitCode: code };
                stream(`\n🏁 Test finished with code ${code}`);

                // 6. Cleanup: Function kept for metrics visibility (User can delete manually)
                stream('\n✨ Test complete. Function metadata preserved for dashboard visibility.');
                res.end();
            });

        } catch (error) {
            stream(`❌ Error: ${error.message}`);
            // Attempt cleanup on error
            if (targetFunctionId) {
                try {
                    await proxyService.deleteFunction(targetFunctionId);
                } catch (e) { /* ignore */ }
            }
            res.end();
        }
    },

    // POST /loadtest/stop
    stopLoadTest(req, res) {
        if (!loadTestProcess || !loadTestStatus.running) {
            return res.status(404).json({ error: 'No load test is currently running' });
        }

        logger.info(`Stopping Load Test (PID: ${loadTestStatus.pid})`);
        loadTestProcess.kill('SIGTERM');
        res.json({ success: true, message: 'Load test stopped', pid: loadTestStatus.pid });
    },

    // GET /loadtest/status
    getLoadTestStatus(req, res) {
        res.json(loadTestStatus);
    },

    // GET /functions
    async listFunctions(req, res) {
        try {
            // 1. Fetch Local Telemetry First (Always available)
            const localStats = await telemetryService.getAll();

            // 2. Try Fetch from AWS
            let awsFunctions = [];
            try {
                awsFunctions = await proxyService.fetch('/functions');
            } catch (e) {
                logger.warn('Upstream AWS unavailable, serving local stats only', { error: e.message });
            }

            if (!Array.isArray(awsFunctions)) {
                awsFunctions = [];
            }

            // 3. Only return functions that exist in AWS (not orphaned telemetry entries)
            // This filters out deleted functions that still have local stats
            const merged = awsFunctions.map(awsFn => {
                const fid = awsFn.functionId;
                const local = localStats[fid] || { calls: 0, status: 'UNKNOWN' };

                return {
                    functionId: fid,
                    name: awsFn.name || fid,
                    runtime: awsFn.runtime || "unknown",
                    status: awsFn.status || local.status,
                    createdAt: awsFn.createdAt || awsFn.uploadedAt || null,
                    uploadedAt: awsFn.uploadedAt || null,
                    memoryMb: awsFn.memoryMb || 128,
                    invocations: awsFn.invocations || 0,
                    avgDuration: awsFn.avgDuration || 0,
                    local_stats: local
                };
            });

            res.json(merged);
        } catch (error) {
            logger.error('List Functions Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // POST /upload
    async upload(req, res) {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            // Robust Runtime Sanitization
            let rawRuntime = req.headers['x-runtime'] || req.body.runtime || 'python';

            // Map specific versions to generic family (ALB requirement)
            const runtimeMap = {
                'python3.11': 'python',
                'nodejs20.x': 'nodejs',
                'cpp17': 'cpp',
                'go1.21': 'go'
            };
            const runtime = runtimeMap[rawRuntime] || rawRuntime;

            const memoryMb = req.headers['x-memory-mb'] || req.body.memoryMb || '128';
            const functionId = req.body.functionId; // Optional update
            const functionName = req.headers['x-function-name']
                ? decodeURIComponent(req.headers['x-function-name'])
                : req.body.name || null;

            const envVars = req.body.envVars || "{}";

            // 1. Proxy Upload with Optimization
            const result = await proxyService.uploadFunction(req.file, runtime, functionId, memoryMb, functionName, envVars);

            // 2. Notify Slack
            slackService.notifyDeploy(result.functionId, runtime, req.file.originalname);

            res.json(result);
        } catch (error) {
            logger.error('Upload Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // POST /run
    async run(req, res) {
        const { functionId, inputData } = req.body;
        if (!functionId) return res.status(400).json({ error: 'functionId required' });

        try {
            // Robust test flag detection (handles objects and stringified JSON)
            let isTest = false;
            if (inputData) {
                if (typeof inputData === 'object' && inputData.test === true) {
                    isTest = true;
                } else if (typeof inputData === 'string') {
                    try {
                        const parsed = JSON.parse(inputData);
                        if (parsed.test === true) isTest = true;
                    } catch (e) { /* not JSON */ }
                }
            }

            // 1. Notify Start (Skip for Load Tests)
            let threadTs = null;
            if (!isTest) {
                threadTs = await slackService.notifyStart(functionId, inputData);
            }

            // 2. Record Run
            await telemetryService.recordRun(functionId);

            // 3. Execute on AWS
            const options = {
                headers: {}
            };
            if (req.headers['x-async']) {
                options.headers['x-async'] = req.headers['x-async'];
            }

            const result = await proxyService.runFunction(functionId, inputData, options);

            // 4. Update Stats & Notify Result
            const isSuccess = !result.error && result.status !== 'ERROR';
            await telemetryService.recordResult(functionId, isSuccess);

            // Async notification (Skip for Load Tests)
            if (threadTs && !isTest) {
                slackService.notifyResult(threadTs, result);
            }

            res.json(result);
        } catch (error) {
            logger.error('Run Error Details:', {
                message: error.message,
                stack: error.stack,
                response: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : 'No response'
            });
            // Even if network fails, record error
            await telemetryService.recordResult(functionId, false);
            res.status(500).json({
                error: error.message,
                details: error.response?.data || 'Check backend logs'
            });
        }
    },

    // GET /logs
    async getLogs(req, res) {
        try {
            const logs = await proxyService.fetch('/logs');
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /functions/:id/logs
    async getFunctionLogs(req, res) {
        try {
            const logs = await proxyService.fetch(`/api/functions/${req.params.id}/logs`);
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // GET /functions/:id
    async getFunctionDetail(req, res) {
        try {
            const detail = await proxyService.fetch(`/functions/${req.params.id}`);
            const stats = await telemetryService.get(req.params.id);
            res.json({ ...detail, local_stats: stats });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // DELETE /functions/:id
    async deleteFunction(req, res) {
        try {
            const functionId = req.params.id;

            // 1. Delete from AWS (Handle "already deleted" 404 gracefully)
            let result = { success: true, message: 'Deleted' };
            try {
                result = await proxyService.deleteFunction(functionId);
            } catch (awsError) {
                if (!awsError.message.includes('404')) {
                    throw awsError; // Re-throw real errors
                }
                logger.info(`Function ${functionId} already deleted from AWS.`);
            }

            // 2. Delete from Local Telemetry (Always cleanup)
            await telemetryService.delete(functionId);

            res.json(result);
        } catch (error) {
            logger.error('Delete Function Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // PUT /functions/:id
    async updateFunction(req, res) {
        try {
            const result = await proxyService.updateFunction(req.params.id, req.body);
            res.json(result);
        } catch (error) {
            logger.error('Update Function Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /functions/:id/metrics
    async getMetrics(req, res) {
        try {
            const functionId = req.params.id;

            // 1. Determine Time Window
            const range = req.query.range || '24h';
            const now = new Date();
            let startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Default 24h

            if (range === '1h') {
                startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            } else if (range === '7d') {
                startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            } else if (range === '30d') {
                startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            }

            // 2. Fetch Prometheus Metrics (Global/Cumulative) - Still useful for "Total" context if needed, but we focus on Window
            const promMetrics = await proxyService.getPrometheusMetricsForFunction(functionId);

            // 3. Fetch Time-Filtered Logs (The Source of Truth for Windowed Metrics)
            let logs = [];
            try {
                // Pass startTime to efficient DynamoDB Query
                logs = await proxyService.fetch(`/api/functions/${functionId}/logs?startTime=${startTime}&limit=1000`);
                if (!Array.isArray(logs)) logs = [];
            } catch (e) {
                logger.warn('Failed to fetch logs for metrics', { functionId, error: e.message });
            }

            // 4. Calculate Windowed Metrics from Logs
            const errorLogs = logs.filter(l => l.status === 'ERROR' || l.status === 'TIMEOUT').length;
            const successLogs = logs.filter(l => l.status === 'SUCCESS').length;
            const durations = logs.filter(l => l.duration > 0).map(l => l.duration);

            const totalInvocations = successLogs + errorLogs;
            const avgDuration = durations.length > 0
                ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
                : 0;

            // 5. Success Rate Calculation
            const successRate = totalInvocations > 0
                ? Math.round((successLogs / totalInvocations) * 100)
                : 100; // Default to 100 if no invocations in window

            const metrics = {
                // Windowed Metrics (Priority)
                invocations: totalInvocations,
                avgDuration: avgDuration,
                errors: errorLogs,
                successRate: successRate,

                // Keep cumulative for reference if needed (optional, could rename to total_*)
                // For now, we override main fields to reflect the VIEW settings

                coldStarts: 0,
                recentExecutions: logs.slice(0, 1000).map(l => ({ // Return all fetched for charts
                    timestamp: l.timestamp,
                    duration: l.duration || 0,
                    status: l.status,
                    memory: l.memory || 0
                }))
            };

            res.json(metrics);
        } catch (error) {
            logger.error('Get Metrics Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /dashboard/stats
    async getDashboardStats(req, res) {
        try {
            // Aggregate stats from functions, telemetry, and Prometheus
            const functions = await proxyService.fetch('/functions');
            const localStats = await telemetryService.getAll();

            // Get Prometheus metrics for real-time accuracy
            let promMetrics = { totalInvocations: 0, avgDuration: 0, errorCount: 0, successRate: 100 };
            try {
                promMetrics = await proxyService.getAllPrometheusMetrics();
            } catch (e) {
                logger.warn('Prometheus metrics unavailable, using local telemetry');
            }

            // Use Prometheus data if available, fallback to DynamoDB aggregated data
            const dbExecCount = Array.isArray(functions) ? functions.reduce((sum, f) => sum + (f.invocations || 0), 0) : 0;
            const localExecCount = Object.values(localStats).reduce((sum, s) => sum + (s.calls || 0), 0);
            const localErrorCount = Object.values(localStats).reduce((sum, s) => sum + (s.errors || 0), 0);

            // Prefer Prometheus > DynamoDB > Local Memory
            const finalTotalExecutions = promMetrics.totalInvocations || dbExecCount || localExecCount;

            const stats = {
                totalFunctions: Array.isArray(functions) ? functions.length : 0,
                activeFunctions: Array.isArray(functions)
                    ? functions.filter(f => f.status === 'READY' || f.status === 'active').length
                    : 0,
                totalExecutions: finalTotalExecutions,
                totalErrors: promMetrics.errorCount || localErrorCount,
                avgResponseTime: promMetrics.avgDuration || 0,
                successRate: promMetrics.successRate || 100,
                byFunction: promMetrics.byFunction || []
            };

            res.json(stats);
        } catch (error) {
            logger.error('Get Dashboard Stats Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /system/status - Combined gateway + worker status
    async getSystemStatus(req, res) {
        try {
            // Gateway status
            const gateway = {
                status: 'online',
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            };

            // Try to fetch worker health
            let worker = { status: 'unknown', pools: {} };
            try {
                const workerHealth = await proxyService.fetchWorkerHealth();
                worker = workerHealth;
            } catch (e) {
                worker = { status: 'offline', error: e.message, pools: {} };
            }

            res.json({
                status: worker.status === 'online' ? 'online' : gateway.status,
                uptime_seconds: worker.uptime_seconds || 0,
                pools: worker.pools || {},  // Root-level pools for Sidebar
                active_workers: worker.active_workers || 0,
                active_jobs: worker.active_jobs || 0,
                gateway,
                worker
            });
        } catch (error) {
            logger.error('Get System Status Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /worker/health - Direct worker health
    async getWorkerHealth(req, res) {
        try {
            const health = await proxyService.fetchWorkerHealth();
            res.json(health);
        } catch (error) {
            logger.error('Get Worker Health Error', error);
            res.status(503).json({
                status: 'offline',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    },

    // GET /status/:jobId
    async getJobStatus(req, res) {
        try {
            const result = await proxyService.fetch(`/status/${req.params.jobId}`);
            res.json(result);
        } catch (error) {
            logger.error('Get Job Status Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /metrics/prometheus
    async getPrometheusMetrics(req, res) {
        try {
            const result = await proxyService.fetchRaw('/metrics');
            res.set('Content-Type', 'text/plain');
            res.send(result);
        } catch (error) {
            logger.error('Get Prometheus Metrics Error', error);
            res.status(500).json({ error: error.message });
        }
    }
};
