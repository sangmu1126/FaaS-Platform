const fetch = require('node-fetch');

// Configuration (Use environment variables for security)
const API_URL = process.env.API_URL || 'http://localhost:8080';
const API_KEY = process.env.API_KEY || 'test-api-key';

async function testAsync() {
    // 1. Get a function ID (assume one exists or create one, but for now lets list)
    console.log("Listing functions...");
    const listRes = await fetch(`${API_URL}/api/functions`, {
        headers: { 'x-api-key': API_KEY }
    });
    const functions = await listRes.json();
    if (functions.length === 0) {
        console.error("No functions found. Please deploy one first.");
        return;
    }
    const fn = functions[0];
    console.log(`Using function: ${fn.name} (${fn.functionId})`);

    // 2. Run Async
    console.log("Triggering Async Run...");
    const start = Date.now();
    const runRes = await fetch(`${API_URL}/api/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'x-async': 'true' // <--- THE KEY
        },
        body: JSON.stringify({
            functionId: fn.functionId,
            inputData: { sleep: 2 } // Mock input
        })
    });

    if (runRes.status !== 202) {
        console.error(`Expected 202, got ${runRes.status}`);
        const text = await runRes.text();
        console.error(text);
        return;
    }

    const { jobId, status } = await runRes.json();
    console.log(`Async triggered! Job ID: ${jobId}, Status: ${status}`);

    // 3. Poll for result
    process.stdout.write("Polling: ");
    while (true) {
        process.stdout.write(".");
        const pollRes = await fetch(`${API_URL}/status/${jobId}`, {
            headers: { 'x-api-key': API_KEY }
        });
        const result = await pollRes.json();

        // Redis key format in controller.js: 
        // if not found -> { status: "pending", ... }
        // if found -> full result object

        if (result.status === 'pending') {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        console.log("\nJob Completed!");
        console.log("Result:", result);
        console.log(`Total Time: ${Date.now() - start}ms`);
        break;
    }
}

testAsync();
