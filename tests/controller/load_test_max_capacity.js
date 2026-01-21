import http from 'k6/http';
import { check, sleep } from 'k6';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';

// Configuration
// Target: Localhost (via IPv4) or External Gateway
const BASE_URL = __ENV.API_URL || 'http://127.0.0.1:8080/api';
const API_KEY = __ENV.API_KEY || 'test-api-key';

// Test Options: Max Capacity Test
// Goal: 1,500+ Req/sec (or max sustainable with 0% error)
export const options = {
    scenarios: {
        max_throughput: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 50 },   // Warm up
                { duration: '20s', target: 200 },  // Ramp to 200 VUs
                { duration: '30s', target: 200 },  // Sustained Load
                { duration: '10s', target: 0 },    // Cool down
            ],
            gracefulRampDown: '5s',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],    // Error rate must be < 1%
        http_req_duration: ['p(95)<1500'], // 95% of tasks within 1.5s (Async ACK speed)
    },
};

// 1. Setup Phase: Upload Function Once
const zipFile = open('./heavy_function.zip', 'b');

export function setup() {
    console.log(`📤 [Setup] Uploading Function to ${BASE_URL}...`);

    const fd = new FormData();
    fd.append('file', http.file(zipFile, 'function.zip'));

    const res = http.post(`${BASE_URL}/upload`, fd.body(), {
        headers: {
            'x-api-key': API_KEY,
            'x-runtime': 'python',
            'Content-Type': 'multipart/form-data; boundary=' + fd.boundary,
        },
    });

    if (res.status !== 200) {
        console.error(`❌ Upload Failed: ${res.status} ${res.body}`);
        throw new Error('Setup failed');
    }

    const body = JSON.parse(res.body);
    console.log(`✅ [Setup] Ready: ${body.functionId}`);
    return { functionId: body.functionId };
}

// 2. VU Code: Execute Function (Async Mode)
export default function (data) {
    const payload = JSON.stringify({
        functionId: data.functionId,
        inputData: { name: 'K6 Max Load', heavy: true }
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'x-async': 'true' // Vital for high throughput (Fire-and-Forget)
        },
    };

    // No sleeps! Fire as fast as possible.
    const res = http.post(`${BASE_URL}/run`, payload, params);

    check(res, {
        'Status is 202 (Accepted)': (r) => r.status === 202,
    });

    // Minimal pause to prevent local port exhaustion if needed, 
    // but for max throughput we keep it 0 or very low.
    sleep(0.01);
}
