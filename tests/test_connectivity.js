import { request } from 'undici';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || 'test-api-key';

async function test() {
    console.log("Starting connectivity test...");
    try {
        const { statusCode, body } = await request(`${API_URL}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'x-async': 'true'
            },
            body: JSON.stringify({ functionId: "t3", inputData: {} }),
            headersTimeout: 5000 // 5s timeout should be enough for async
        });

        console.log(`Status: ${statusCode}`);
        const text = await body.text();
        console.log(`Body: ${text}`);

    } catch (err) {
        console.error("Request Failed:", err);
    }
}

test();
