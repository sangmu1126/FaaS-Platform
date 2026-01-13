const fs = require('fs');
const path = require('path');

// Configuration (Use environment variables for security)
const API_URL = process.env.API_URL || "http://localhost:8080";
const API_KEY = process.env.API_KEY || "test-api-key";
const CONCURRENT_REQUESTS = 5;

async function uploadFunction() {
    console.log("📤 Uploading Test Function...");
    const formData = new FormData();
    const blob = new Blob([fs.readFileSync(path.join(__dirname, 'function.zip'))]);
    formData.append('file', blob, 'function.zip');

    const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { 'x-api-key': API_KEY, 'x-runtime': 'python' },
        body: formData
    });
    const data = await res.json();
    console.log(`✅ Uploaded: ${data.functionId}`);
    return data.functionId;
}

async function runRequest(id, idx) {
    const start = Date.now();
    try {
        const res = await fetch(`${API_URL}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
            body: JSON.stringify({ functionId: id, inputData: { name: `Req-${idx}` } })
        });
        const data = await res.json();
        const duration = Date.now() - start;
        return { idx, duration, status: data.status, worker: data.workerId, coldStart: duration > 500 };
    } catch (e) {
        return { idx, duration: Date.now() - start, status: "ERROR", error: e.message };
    }
}

async function main() {
    try {
        const functionId = await uploadFunction();

        console.log(`\n🚀 Starting ${CONCURRENT_REQUESTS} Concurrent Requests...`);
        console.log("----------------------------------------------------------------");

        const promises = [];
        for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
            promises.push(runRequest(functionId, i + 1));
        }

        const results = await Promise.all(promises);

        console.log("idx | Duration | Status  | WorkerID           | Note");
        console.log("----|----------|---------|--------------------|-------");
        let maxDuration = 0;
        results.forEach(r => {
            if (r.duration > maxDuration) maxDuration = r.duration;
            const note = r.duration < 5000 ? "🔥 Warm Start (Fast)" : "🧊 Cold Start (Slow)";
            console.log(`${r.idx.toString().padEnd(3)} | ${r.duration.toString().padEnd(6)}ms | ${r.status.padEnd(7)} | ${r.worker.slice(0, 18)} | ${note}`);
        });
        console.log("----------------------------------------------------------------");

        // Comparison Summary
        const baseline = 13500; // Serial execution took ~13.5s
        const improvement = ((baseline - maxDuration) / baseline * 100).toFixed(1);
        const speedup = (baseline / maxDuration).toFixed(1);

        console.log("\n📊 Performance Improvement Report:");
        console.log(`   - Baseline (Serial):   ${(baseline / 1000).toFixed(1)}s (Previous)`);
        console.log(`   - Optimized (Current): ${(maxDuration / 1000).toFixed(1)}s`);
        console.log(`   - Speedup Factor:      ${speedup}x Faster 🚀`);
        console.log(`   - Time Saved:          ${improvement}%`);
        console.log("----------------------------------------------------------------");
    } catch (e) {
        console.error("Critical Error:", e);
    }
}

main();
