const fs = require('fs');
const path = require('path');

// Configuration
// Pointing to Local Smart Gateway
const API_URL = "http://localhost:8080/api";
const API_KEY = "test-api-key";

async function main() {
    console.log(`🚀 Starting Gateway E2E Test against ${API_URL}`);

    // Create a dummy zip if not exists
    const zipPath = path.join(__dirname, '../function.zip');
    if (!fs.existsSync(zipPath)) {
        fs.writeFileSync(zipPath, 'dummy content');
    }

    // 1. Upload Function
    console.log("\n[1] Uploading Function...");
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(zipPath)]);
    formData.append('file', blob, 'function.zip');

    // Additional fields for Smart Gateway to optimize
    formData.append('functionId', 'test-local-func');
    formData.append('runtime', 'python');

    try {
        const uploadRes = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
                // 'x-api-key': API_KEY, // Gateway adds this? Let's see. 
                // Gateway proxyService adds x-api-key. 
                // But multer middleware might need headers if we didn't mock auth in gateway?
                // Gateway doesn't have auth middleware yet! It's open.
                // It forwards to ALB which checks auth.
            },
            body: formData
        });

        if (!uploadRes.ok) {
            console.log(`⚠️ Upload info: ${uploadRes.status} (Likely ALB rejected dummy auth/file, but Gateway worked if 4xx/5xx from upstream)`);
            // We expect Gateway to try proxying. If ALB is reachable, it might say 401 or 400.
            // If Gateway crashes, failure.
        } else {
            const uploadData = await uploadRes.json();
            console.log("✅ Upload Success (Upstream accepted):", uploadData);
        }

        // 2. Run Function (Simulated)
        // Even if upload failed (due to upstream), let's try running a known function ID if possible, 
        // or just the one we tried.
        const functionId = 'test-local-func';

        console.log(`\n[2] Executing Function (${functionId})...`);

        const runRes = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                functionId: functionId,
                inputData: { name: "Gateway Tester" }
            })
        });

        // We expect this to fail 500 if upstream fails, OR 200 if upstream works.
        // BUT, Telemetry should record the attempt regardless.

        const result = await runRes.json();
        console.log("Result:", result);

    } catch (e) {
        console.error("❌ Test Failed:", e.message);
    }
}

main();
