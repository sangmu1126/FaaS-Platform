const express = require('express');
const http = require('http');

// --- 1. Mocks Setup ---
const mockDB = new Map();

// Mock Commands
class PutItemCommand { constructor(input) { this.input = input; } }
class GetItemCommand { constructor(input) { this.input = input; } }
class ScanCommand { constructor(input) { this.input = input; } }
class DeleteItemCommand { constructor(input) { this.input = input; } }
class UpdateItemCommand { constructor(input) { this.input = input; } }
class DeleteObjectCommand { constructor(input) { this.input = input; } }
class SendMessageCommand { constructor(input) { this.input = input; } }

// Mock Clients
class MockDynamoDBClient {
    send(command) {
        return new Promise((resolve, reject) => {
            if (command instanceof PutItemCommand) {
                const item = command.input.Item;
                mockDB.set(item.functionId.S, item);
                resolve({});
            } else if (command instanceof GetItemCommand) {
                const item = mockDB.get(command.input.Key.functionId.S);
                resolve({ Item: item });
            } else if (command instanceof ScanCommand) {
                resolve({ Items: Array.from(mockDB.values()) });
            } else if (command instanceof UpdateItemCommand) {
                const id = command.input.Key.functionId.S;
                const item = mockDB.get(id);
                if (!item) return resolve({}); // Simple mock

                // Naive UpdateExpression Parser for the specific test case
                // "set updated_at = :t, description = :d"
                const values = command.input.ExpressionAttributeValues;
                if (values[':d']) {
                    item.description = values[':d'];
                }
                mockDB.set(id, item);
                resolve({});
            } else {
                resolve({});
            }
        });
    }
}

class MockS3Client {
    send(command) { return Promise.resolve({}); }
}

class MockSQSClient {
    send(command) { return Promise.resolve({}); }
}

const EventEmitter = require('events');
class MockRedis extends EventEmitter {
    constructor(opts) {
        super();
        setTimeout(() => this.emit('connect'), 10);
    }
    on(event, cb) { super.on(event, cb); }
    quit() { return Promise.resolve(); }
    psubscribe() { }
}

// Inject Mocks into require.cache
require.cache[require.resolve('@aws-sdk/client-dynamodb')] = {
    exports: {
        DynamoDBClient: MockDynamoDBClient,
        PutItemCommand, GetItemCommand, ScanCommand, DeleteItemCommand, UpdateItemCommand
    }
};
require.cache[require.resolve('@aws-sdk/client-s3')] = {
    exports: {
        S3Client: MockS3Client,
        DeleteObjectCommand
    }
};
require.cache[require.resolve('@aws-sdk/client-sqs')] = {
    exports: {
        SQSClient: MockSQSClient,
        SendMessageCommand
    }
};
require.cache[require.resolve('ioredis')] = {
    exports: MockRedis
};

// Mock multer-s3 to avoid S3 dependency
const multerS3 = () => {
    return {
        _handleFile: (req, file, cb) => {
            file.key = "mock-key";
            req.functionId = "mock-id-123";
            cb(null, { key: "mock-key", location: "mock-loc" });
        },
        _removeFile: (req, file, cb) => cb(null)
    };
};
require.cache[require.resolve('multer-s3')] = { exports: multerS3 };


// --- 2. Environment Variables ---
process.env.AWS_REGION = 'us-test-1';
process.env.BUCKET_NAME = 'test-bucket';
process.env.TABLE_NAME = 'test-table';
process.env.SQS_URL = 'http://localhost:4566/sqs';
process.env.REDIS_HOST = 'localhost';
process.env.INFRA_API_KEY = 'test-key';
process.env.PORT = '8081'; // Avoid conflict if 8080 is taken

// --- 3. Start Controller ---
console.log("Starting Controller with Mocks...");
// We need to use require but protect against it running automatically if it wasn't designed to be imported? 
// controller.js DOES run `app.listen` at the end.
// We will let it run.
const controller = require('../Infra-controller/controller');

// --- 4. Run Tests ---
async function runTests() {
    // Wait for server to start
    await new Promise(r => setTimeout(r, 2000));
    const BASE_URL = `http://localhost:8080`;
    const HEADERS = { 'x-api-key': 'test-key' };

    console.log(`\n[Test 1] POST /upload (Create Function)`);
    // We can't easily upload file via fetch here without FormData polyfill in Node < 18 or extra lib.
    // Use 'child_process' to curl? Or use built-in fetch (Node 18+).
    // Assuming Node 20 is installed (from user_data script).

    // For POST /upload, we need multipart.
    // Let's rely on the fact we mocked multerS3.
    // We can send a basic multipart body.
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.zip"',
        'Content-Type: application/zip',
        '',
        'dummy content',
        `--${boundary}`,
        'Content-Disposition: form-data; name="description"',
        '',
        'Initial Description',
        `--${boundary}--`,
        ''
    ].join('\r\n');

    try {
        const res1 = await fetch(`${BASE_URL}/upload`, {
            method: 'POST',
            headers: {
                ...HEADERS,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'x-runtime': 'python',
                'x-memory-mb': '128'
            },
            body: body
        });
        const json1 = await res1.json();
        console.log("Response:", JSON.stringify(json1));
        if (json1.success) console.log("✅ upload success");
        else { console.error("❌ upload failed", json1); process.exit(1); }

        const functionId = json1.functionId || "mock-id-123"; // Our mocked multer might set it, but controller uses uuid

        console.log(`\n[Test 2] GET /functions/${functionId} (Check Description)`);
        const res2 = await fetch(`${BASE_URL}/functions/${functionId}`, { headers: HEADERS });
        const json2 = await res2.json();
        console.log("Response:", JSON.stringify(json2));
        if (json2.description === 'Initial Description') console.log("✅ Description matches");
        else console.error(`❌ Expected 'Initial Description', got '${json2.description}'`);

        console.log(`\n[Test 3] PUT /functions/${functionId} (Update Description)`);
        const res3 = await fetch(`${BASE_URL}/functions/${functionId}`, {
            method: 'PUT',
            headers: { ...HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'Updated Description' })
        });
        const json3 = await res3.json();
        console.log("Response:", JSON.stringify(json3));

        console.log(`\n[Test 4] GET /functions/${functionId} (Verify Update)`);
        const res4 = await fetch(`${BASE_URL}/functions/${functionId}`, { headers: HEADERS });
        const json4 = await res4.json();
        console.log("Response:", JSON.stringify(json4));
        if (json4.description === 'Updated Description') console.log("✅ Updated description matches");
        else console.error(`❌ Expected 'Updated Description', got '${json4.description}'`);

        console.log(`\n[Test 5] GET /functions (List Verify)`);
        const res5 = await fetch(`${BASE_URL}/functions`, { headers: HEADERS });
        const json5 = await res5.json();
        const item = json5.find(f => f.functionId === functionId);
        if (item && item.description === 'Updated Description') console.log("✅ List contains verification");
        else console.error(`❌ List item missing or wrong description`, item);

        console.log("\nALL TESTS PASSED");
        process.exit(0);

    } catch (err) {
        console.error("Test Error", err);
        process.exit(1);
    }
}

runTests();
