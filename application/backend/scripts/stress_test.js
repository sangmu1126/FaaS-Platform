import http from 'http';
import https from 'https';
import { performance } from 'perf_hooks';

const API_KEY = process.env.INFRA_API_KEY;
const AUTH_TOKEN = process.env.LOAD_TEST_AUTH_TOKEN;
if (!API_KEY && !AUTH_TOKEN) throw new Error('INFRA_API_KEY or LOAD_TEST_AUTH_TOKEN is required');

const PROTOCOL = (process.env.LOAD_TEST_PROTOCOL || 'http').replace(':', '');
const HOST = process.env.LOAD_TEST_TARGET_HOST || 'localhost';
const PORT = Number.parseInt(process.env.LOAD_TEST_TARGET_PORT || (PROTOCOL === 'https' ? '443' : '8080'), 10);
const PATH = process.env.LOAD_TEST_PATH || '/api/run';
const CONCURRENCY = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || '200', 10);
const DURATION_SEC = Number.parseInt(process.env.LOAD_TEST_DURATION || '30', 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.LOAD_TEST_TIMEOUT_MS || '5000', 10);
const THINK_TIME_MS = Number.parseInt(process.env.LOAD_TEST_THINK_TIME_MS || '0', 10);
const functionId = process.env.TARGET_FUNCTION_ID || '1';

if (!['http', 'https'].includes(PROTOCOL)) throw new Error('LOAD_TEST_PROTOCOL must be http or https');

for (const [name, value] of Object.entries({ PORT, CONCURRENCY, DURATION_SEC, REQUEST_TIMEOUT_MS, THINK_TIME_MS })) {
    if (!Number.isFinite(value) || value < 0 || (name !== 'THINK_TIME_MS' && value === 0)) {
        throw new Error(`${name} must be a positive integer`);
    }
}

const transport = PROTOCOL === 'https' ? https : http;
const agent = new transport.Agent({
    keepAlive: true,
    maxSockets: CONCURRENCY,
    maxFreeSockets: CONCURRENCY
});

function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve) => {
        const startedAt = performance.now();
        const options = {
            agent,
            hostname: HOST,
            port: PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-async': 'true'
            }
        };

        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolve({ ...result, durationMs: performance.now() - startedAt });
        };

        if (API_KEY) options.headers['x-api-key'] = API_KEY;
        if (AUTH_TOKEN) options.headers.Authorization = `Bearer ${AUTH_TOKEN}`;

        const req = transport.request(options, (res) => {
            res.resume();
            res.on('end', () => finish({ status: res.statusCode, error: null }));
            res.on('error', (error) => finish({ status: 0, error: error.message }));
        });

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy();
            finish({ status: 0, error: 'timeout' });
        });
        req.on('error', (error) => finish({ status: 0, error: error.message }));

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function percentile(sortedValues, percentileValue) {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function run() {
    console.log(`Starting completion-based load test: ${CONCURRENCY} VUs for ${DURATION_SEC}s`);
    console.log(`Target: ${PROTOCOL}://${HOST}:${PORT}${PATH} (functionId: ${functionId})`);
    console.log(`Request timeout: ${REQUEST_TIMEOUT_MS}ms | Think time: ${THINK_TIME_MS}ms`);
    console.log('Success criterion: completed HTTP 200/202 response');
    console.log('');

    let startedCount = 0;
    let completedCount = 0;
    let successCount = 0;
    const statusCounts = new Map();
    const errorCounts = new Map();
    const latencies = [];
    const startedAt = performance.now();
    const stopAt = startedAt + DURATION_SEC * 1000;
    let previousDisplayAt = startedAt;
    let previousSuccessCount = 0;

    const displayInterval = setInterval(() => {
        const now = performance.now();
        const elapsedSec = (now - startedAt) / 1000;
        const intervalSec = (now - previousDisplayAt) / 1000;
        const intervalSuccesses = successCount - previousSuccessCount;
        const acceptedRps = intervalSuccesses / intervalSec;
        const inFlight = startedCount - completedCount;
        const successRate = completedCount > 0 ? (successCount / completedCount) * 100 : 0;

        console.log(
            `[${elapsedSec.toFixed(1)}s] Started: ${startedCount} | Completed: ${completedCount} | ` +
            `In-flight: ${inFlight} | OK: ${successCount} | SR: ${successRate.toFixed(1)}% | ` +
            `Accepted RPS(1s): ${acceptedRps.toFixed(1)}`
        );

        previousDisplayAt = now;
        previousSuccessCount = successCount;
    }, 1000);

    const virtualUser = async () => {
        while (performance.now() < stopAt) {
            startedCount++;
            const result = await makeRequest(PATH, 'POST', {
                functionId,
                inputData: { test: true }
            });

            completedCount++;
            latencies.push(result.durationMs);

            if (result.status === 200 || result.status === 202) {
                successCount++;
            }

            const statusKey = String(result.status || 'NETWORK_ERROR');
            statusCounts.set(statusKey, (statusCounts.get(statusKey) || 0) + 1);
            if (result.error) {
                errorCounts.set(result.error, (errorCounts.get(result.error) || 0) + 1);
            }

            if (THINK_TIME_MS > 0) await sleep(THINK_TIME_MS);
        }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => virtualUser()));
    clearInterval(displayInterval);
    agent.destroy();

    const finishedAt = performance.now();
    const wallDurationSec = (finishedAt - startedAt) / 1000;
    const sortedLatencies = latencies.sort((a, b) => a - b);
    const successRate = completedCount > 0 ? (successCount / completedCount) * 100 : 0;

    console.log('\n=================================');
    console.log('Load Test Completed (all requests drained)');
    console.log(`Configured Duration: ${DURATION_SEC}s`);
    console.log(`Actual Wall Duration: ${wallDurationSec.toFixed(2)}s`);
    console.log(`Requests Started: ${startedCount}`);
    console.log(`Responses Completed: ${completedCount}`);
    console.log(`Successful Responses (200/202): ${successCount}`);
    console.log(`Failed Responses: ${completedCount - successCount}`);
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Accepted Throughput: ${(successCount / wallDurationSec).toFixed(2)} RPS`);
    console.log(`Response Throughput: ${(completedCount / wallDurationSec).toFixed(2)} RPS`);
    console.log(
        `Latency: avg=${(latencies.reduce((sum, value) => sum + value, 0) / Math.max(latencies.length, 1)).toFixed(2)}ms ` +
        `p50=${percentile(sortedLatencies, 50).toFixed(2)}ms ` +
        `p95=${percentile(sortedLatencies, 95).toFixed(2)}ms ` +
        `p99=${percentile(sortedLatencies, 99).toFixed(2)}ms ` +
        `max=${(sortedLatencies.at(-1) || 0).toFixed(2)}ms`
    );
    console.log(`Status Codes: ${JSON.stringify(Object.fromEntries(statusCounts))}`);
    if (errorCounts.size > 0) console.log(`Network Errors: ${JSON.stringify(Object.fromEntries(errorCounts))}`);
    console.log('=================================');
}

run().catch((error) => {
    agent.destroy();
    console.error(error);
    process.exitCode = 1;
});
