const http = require('http');

console.log("🚀 Starting Simulated Worker...");

const CONTROLLER_URL = 'http://localhost:8080/api/worker/heartbeat';
// Alternatively use external IP if testing remotely
// const CONTROLLER_URL = 'http://3.38.96.228:8080/api/worker/heartbeat';

const WORKER_ID = 'simulated-worker-local';
const API_KEY = 'test-api-key';

function sendHeartbeat() {
    const data = JSON.stringify({
        workerId: WORKER_ID,
        timestamp: Date.now(),
        status: 'healthy',
        pools: { python: 5, nodejs: 5 },
        activeJobs: 0,
        uptimeSeconds: process.uptime()
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            // 'x-api-key': API_KEY // Not needed per code analysis, but adding for completeness if things change
        }
    };

    const req = http.request(CONTROLLER_URL, options, (res) => {
        if (res.statusCode === 200) {
            console.log(`[${new Date().toISOString()}] Heartbeat sent OK`);
        } else {
            console.error(`[${new Date().toISOString()}] Heartbeat Failed: ${res.statusCode}`);
            res.on('data', d => console.error(d.toString()));
        }
    });

    req.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] Request Error: ${error.message}`);
    });

    req.write(data);
    req.end();
}

// Send every 5 seconds
setInterval(sendHeartbeat, 5000);
sendHeartbeat();
