const fs = require('fs');
const path = require('path');

// Configuration (Use environment variables for security)
const API_URL = process.env.API_URL || "http://localhost:8080"; // Controller Public IP
const API_KEY = process.env.API_KEY || "test-api-key";

async function main() {
    console.log(`🚀 Starting Full E2E Test against ${API_URL}`);

    // 1. Upload Function
    console.log("\n[1] Uploading Function...");
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(path.join(__dirname, 'function.zip'))]);
    formData.append('file', blob, 'function.zip');

    try {
        const uploadRes = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
                'x-api-key': API_KEY,
                'x-runtime': 'python'
            },
            body: formData
        });

        if (!uploadRes.ok) throw new Error(`Upload Failed: ${uploadRes.status} ${await uploadRes.text()}`);

        const uploadData = await uploadRes.json();
        console.log("✅ Upload Success:", uploadData);
        const functionId = uploadData.functionId;


        // 2. Run Function
        console.log(`\n[2] Executing Function (${functionId})...`);
        const startTime = Date.now();

        const runRes = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            body: JSON.stringify({
                functionId: functionId,
                inputData: { name: "Antigravity User" }
            })
        });

        if (!runRes.ok) throw new Error(`Run Failed: ${runRes.status} ${await runRes.text()}`);

        const result = await runRes.json();
        const duration = Date.now() - startTime;

        console.log(`✅ Execution Success (${duration}ms)`);
        console.log("---------------------------------------------------");
        console.log("RESULT:", JSON.stringify(result, null, 2));
        console.log("---------------------------------------------------");

        if (result.stdout.includes("Hello, Antigravity User!")) {
            console.log("🎉 TEST PASSED: Output matches expected string.");
        } else {
            console.log("⚠️ TEST WARNING: Output verification failed.");
        }

    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
}

main();
