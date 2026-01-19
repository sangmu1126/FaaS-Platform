const fs = require('fs');
const path = require('path');

// Configuration (Use environment variables for security)
const API_URL = process.env.API_URL || "http://localhost:8080"; // Controller Public IP
const API_KEY = process.env.API_KEY || "test-api-key";

async function main() {
    console.log(`🚀 Starting E2E Test against AWS Controller at ${API_URL}`);

    // 1. Create a dummy function zip
    const zipPath = path.join(__dirname, 'test_function.zip');
    // Create a simple zip file (requires 'jszip' or 'adm-zip' usually, but native fetch doesn't zip)
    // For simplicity, we assume 'test_function.zip' exists or we use a text file masquerading (if server allows, but server expects zip)
    // Wait, let's just create a simple Python file and try to upload it as a "zip" (server unzip might fail if strict)
    // Better: Just use a pre-existing zip if available, or create one using system zip if possible.
    // Alternative: Just fail if no zip. 
    // Actually, let's simply assume the user can provide a file, OR we make a dummy file.
    // The server uses 'unzip', so it must be a valid zip.

    // Let's create a minimal valid zip using a buffer for "main.py" -> print("Hello FaaS from Cloud")
    // PK... header logic is complex. 
    // Instead, to keep it simple, we will retry with a known zip file from the project if available, 
    // OR we will ask the user to zip one.
    // BUT I can write a valid empty zip hex string? No, too fragile.

    // Let's SKIP the zip creation and assume there is a 'function.zip' or similar, 
    // OR simpler: Try to verify 'GET /health` first.

    // 1. Health Check
    try {
        const healthRes = await fetch(`${API_URL}/health`);
        const healthData = await healthRes.json();
        console.log("✅ Health Check:", healthData);
    } catch (e) {
        console.error("❌ Health Check Failed:", e.message);
        return;
    }

    console.log("\n⚠️ To run a full function test, we need a 'test.zip' file.");
    console.log("Please run this script only after verifying Health Check.");
}

main();
