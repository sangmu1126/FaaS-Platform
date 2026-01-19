import http from 'k6/http';
import { check, sleep } from 'k6';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// Configuration (Use environment variables for security)
// Run with: k6 run -e K6_BASE_URL=http://your-ip:8080/api -e K6_API_KEY=your-key script.js
const BASE_URL = __ENV.K6_BASE_URL || 'http://127.0.0.1:8080/api';
const API_KEY = __ENV.K6_API_KEY || 'test-api-key';

// Test Options: 50 Virtual Users (Cloud Production)
export const options = {
    stages: [
        { duration: '5s', target: 20 },  // Ramp up
        { duration: '20s', target: 50 }, // Steady Load (50 VU)
        { duration: '5s', target: 0 },   // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.01'],
    },
};

// 1. Setup Phase: Upload Function Once
const zipFile = open('./heavy_function_cloud.zip', 'b');

export function setup() {
    console.log('📤 [Setup] Uploading Heavy Function to Cloud...');

    const fd = new FormData();
    fd.append('file', http.file(zipFile, 'function.zip'));

    const res = http.post(`${BASE_URL}/upload`, fd.body(), {
        headers: {
            'x-api-key': API_KEY,
            'x-runtime': 'python',
            'Content-Type': 'multipart/form-data; boundary=' + fd.boundary,
        },
    });

    console.log(`[DEBUG] Status: ${res.status}`);
    check(res, { 'Upload status is 200': (r) => r.status === 200 });

    if (res.status !== 200) {
        throw new Error(`Upload Failed: ${res.status} ${res.body}`);
    }

    const body = JSON.parse(res.body);
    console.log(`✅ [Setup] Function Uploaded: ${body.functionId}`);

    return { functionId: body.functionId };
}

// Helper to generate random IP
function getRandomIP() {
    return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// 2. VU Code: Execute Function
export default function (data) {
    const spoofedIP = getRandomIP(); // Unique IP per iteration

    // A. Health Check
    const resHealth = http.get(`${BASE_URL}/system/status`, {
        headers: {
            'x-api-key': API_KEY,
            'X-Forwarded-For': spoofedIP
        },
    });
    check(resHealth, { 'Health Check 200': (r) => r.status === 200 });

    // B. Function Execution
    const payload = JSON.stringify({
        functionId: data.functionId,
        inputData: { name: 'K6 Cloud 50VU' }
    });

    const resRun = http.post(`${BASE_URL}/run`, payload, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'X-Forwarded-For': spoofedIP
        },
    });

    const checkRes = check(resRun, {
        'Run status is 200': (r) => r.status === 200,
        // Assert "Processed" for heavy_task.py
        'Response contains Processed': (r) => r.body && r.body.includes('Processed'),
    });

    if (!checkRes) {
        console.error(`❌ Check Failed. Status: ${resRun.status}, Body: ${resRun.body}`);
    }

    sleep(1);
}
