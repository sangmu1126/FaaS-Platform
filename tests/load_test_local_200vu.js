import http from 'k6/http';
import { check, sleep } from 'k6';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// Configuration
// Target: Localhost (via IPv4)
const BASE_URL = 'http://127.0.0.1:8080/api';
const API_KEY = 'test-api-key';

// Test Options: 200 Virtual Users (Stress Test)
export const options = {
    stages: [
        { duration: '5s', target: 50 },   // Fast Ramp up
        { duration: '20s', target: 200 }, // Heavy Load (200 VU)
        { duration: '5s', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<2000'],
        http_req_failed: ['rate<0.01'],
    },
};

// 1. Setup Phase: Upload Function Once
const zipFile = open('./heavy_function.zip', 'b');

export function setup() {
    console.log('📤 [Setup] Uploading Heavy Function (Local Stress)...');

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

// 2. VU Code: Execute Function
export default function (data) {
    // A. Health Check
    const resHealth = http.get(`${BASE_URL}/system/status`, {
        headers: { 'x-api-key': API_KEY },
    });
    check(resHealth, { 'Health Check 200': (r) => r.status === 200 });

    // B. Function Execution
    const payload = JSON.stringify({
        functionId: data.functionId,
        inputData: { name: 'K6 Local 200VU' }
    });

    const resRun = http.post(`${BASE_URL}/run`, payload, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
        },
    });

    const checkRes = check(resRun, {
        'Run status is 200': (r) => r.status === 200,
        // Assert "Processed" for heavy_task.py
        'Response contains Processed': (r) => r.body && r.body.includes('Processed'),
    });

    if (!checkRes) {
        // Log unexpected errors (ignoring 429 for stress test noise, or keep it to show rate limiting)
        console.error(`❌ Check Failed. Status: ${resRun.status}, Body: ${resRun.body}`);
    }

    sleep(1);
}
