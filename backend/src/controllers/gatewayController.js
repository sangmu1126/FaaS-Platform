import { proxyService } from '../services/proxyService.js';
import { telemetryService } from '../services/telemetryService.js';
import { slackService } from '../services/slackService.js';
import { logger } from '../utils/logger.js';

export const gatewayController = {

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

            // 3. Merge Strategy
            const allFunctionIds = new Set([
                ...awsFunctions.map(f => f.functionId),
                ...Object.keys(localStats)
            ]);

            const merged = Array.from(allFunctionIds).map(fid => {
                const awsFn = awsFunctions.find(f => f.functionId === fid) || {};
                const local = localStats[fid] || { calls: 0, status: 'UNKNOWN' };

                return {
                    functionId: fid,
                    name: awsFn.name || "Unknown (Offline)",
                    runtime: awsFn.runtime || "unknown",
                    status: awsFn.status || local.status,
                    createdAt: awsFn.createdAt || awsFn.uploadedAt || null,
                    uploadedAt: awsFn.uploadedAt || null,
                    memoryMb: awsFn.memoryMb || 128,
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

            // 1. Proxy Upload with Optimization
            const result = await proxyService.uploadFunction(req.file, runtime, functionId, memoryMb, functionName);

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
            // 1. Notify Start
            const threadTs = await slackService.notifyStart(functionId, inputData);

            // 2. Record Run
            await telemetryService.recordRun(functionId);

            // 3. Execute on AWS
            const result = await proxyService.runFunction(functionId, inputData);

            // 4. Update Stats & Notify Result
            const isSuccess = !result.error && result.status !== 'ERROR';
            await telemetryService.recordResult(functionId, isSuccess);

            // Async notification to not block response too long
            // (Though runFunction waits for execution, so we have the result now)
            slackService.notifyResult(threadTs, result);

            res.json(result);

        } catch (error) {
            logger.error('Run Error', error);
            // Even if network fails, record error
            await telemetryService.recordResult(functionId, false);
            res.status(500).json({ error: error.message });
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
            const result = await proxyService.deleteFunction(req.params.id);
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
            const metrics = await proxyService.getMetrics(req.params.id);
            res.json(metrics);
        } catch (error) {
            logger.error('Get Metrics Error', error);
            res.status(500).json({ error: error.message });
        }
    },

    // GET /dashboard/stats
    async getDashboardStats(req, res) {
        try {
            // Aggregate stats from functions and telemetry
            const functions = await proxyService.fetch('/functions');
            const localStats = await telemetryService.getAll();

            const stats = {
                totalFunctions: Array.isArray(functions) ? functions.length : 0,
                activeFunctions: Array.isArray(functions)
                    ? functions.filter(f => f.status === 'READY' || f.status === 'active').length
                    : 0,
                totalExecutions: Object.values(localStats).reduce((sum, s) => sum + (s.calls || 0), 0),
                totalErrors: Object.values(localStats).reduce((sum, s) => sum + (s.errors || 0), 0),
                successRate: 0
            };

            if (stats.totalExecutions > 0) {
                stats.successRate = ((stats.totalExecutions - stats.totalErrors) / stats.totalExecutions * 100).toFixed(2);
            }

            res.json(stats);
        } catch (error) {
            logger.error('Get Dashboard Stats Error', error);
            res.status(500).json({ error: error.message });
        }
    }
};
