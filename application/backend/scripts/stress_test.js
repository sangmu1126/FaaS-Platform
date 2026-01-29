import http from 'http';

const API_KEY = process.env.INFRA_API_KEY || 'test-api-key';
const HOST = process.env.LOAD_TEST_TARGET_HOST || 'localhost';
const PORT = process.env.LOAD_TEST_TARGET_PORT || 8080;
const CONCURRENCY = parseInt(process.env.LOAD_TEST_CONCURRENCY || '200');
const DURATION_SEC = parseInt(process.env.LOAD_TEST_DURATION || '30');
const functionId = process.env.TARGET_FUNCTION_ID || '1';

function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: '/api' + path,
            method: method,
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json',
                'x-async': 'true'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ status: 408, body: 'Timeout' });
        });

        req.on('error', (e) => resolve({ status: 500, body: e.message }));
        req.setTimeout(2000);

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log(`🚀 Starting Load Test: ${CONCURRENCY} VUs for ${DURATION_SEC}s`);
    console.log(`📍 Target: ${HOST}:${PORT}/api/run (functionId: ${functionId})`);
    console.log('');

    let requestsSent = 0;
    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    const displayInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const rps = (requestsSent / elapsed).toFixed(1);
        const totalHandled = successCount + failCount;
        const successRate = totalHandled > 0 ? ((successCount / totalHandled) * 100).toFixed(1) : '0.0';
        console.log(`[${elapsed.toFixed(1)}s] Reqs: ${requestsSent} | OK: ${successCount} | ERR: ${failCount} | SR: ${successRate}% | RPS: ${rps}`);
    }, 500);

    const attackLoop = async () => {
        while ((Date.now() - startTime) < DURATION_SEC * 1000) {
            try {
                requestsSent++;
                makeRequest('/run', 'POST', {
                    functionId: functionId,
                    inputData: { test: true }
                }).then(r => {
                    if (r.status === 200 || r.status === 202) successCount++;
                    else failCount++;
                }).catch(() => failCount++);

                await new Promise(r => setTimeout(r, 10));
            } catch (e) {
                failCount++;
            }
        }
    };

    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        workers.push(attackLoop());
    }

    await Promise.all(workers);
    clearInterval(displayInterval);

    console.log("\n=================================");
    console.log("✅ Load Test Completed");
    const totalHandled = successCount + failCount;
    const finalSuccessRate = totalHandled > 0 ? ((successCount / totalHandled) * 100).toFixed(1) : '0.0';
    console.log(`Total Requests Sent: ${requestsSent}`);
    console.log(`Total Responses Received: ${totalHandled}`);
    console.log(`Success Rate: ${finalSuccessRate}%`);
    console.log("=================================");
}

run();
