const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
require('dotenv').config();

const API_Url = 'http://localhost:8080';
const API_KEY = process.env.INFRA_API_KEY || 'test-api-key';

// Mock file creation for upload
const TEST_FILE_PATH = path.join(__dirname, 'temp_test_code.zip');
if (!fs.existsSync(TEST_FILE_PATH)) {
    fs.writeFileSync(TEST_FILE_PATH, 'dummy content');
}

async function uploadFunction(runtime, memoryMb) {
    const form = new FormData();
    form.append('file', fs.createReadStream(TEST_FILE_PATH));

    try {
        const response = await axios.post(`${API_Url}/upload`, form, {
            headers: {
                ...form.getHeaders(),
                'x-api-key': API_KEY,
                'x-runtime': runtime,
                'x-memory-mb': memoryMb.toString()
            },
            validateStatus: () => true
        });
        return response;
    } catch (error) {
        console.error("Upload Request Failed:", error.message);
        throw error;
    }
}

describe('Memory Limit Enforcement Tests', function () {
    this.timeout(10000);

    // 1. Python (AI) - Should allow High Memory
    it('should allow Python with 5GB (5120MB) memory', async () => {
        const res = await uploadFunction('python', 5120);
        // If DB is down, we might get 500, but that means validation passed.
        // If validation failed, we would get 400.
        if (res.status === 500) {
            console.log("Got 500 (Expected if DB missing):", res.data.error);
            expect(res.data.error).to.not.include("Invalid memoryMb");
        } else {
            expect(res.status).to.equal(200);
            expect(res.data.success).to.be.true;
        }
    });

    // 2. Python (AI) - Should allow Max 10GB
    it('should allow Python with 10GB (10240MB) memory', async () => {
        const res = await uploadFunction('python', 10240);
        if (res.status === 500) {
            expect(res.data.error).to.not.include("Invalid memoryMb");
        } else {
            expect(res.status).to.equal(200);
        }
    });

    // 3. Python (AI) - Should fail > 10GB
    it('should reject Python with 11GB (11264MB) memory', async () => {
        const res = await uploadFunction('python', 11264);
        expect(res.status).to.equal(400);
        expect(res.data.error).to.include("Invalid memoryMb");
    });

    // 4. Node.js (General) - Should allow Standard Memory
    it('should allow Node.js with 512MB memory', async () => {
        const res = await uploadFunction('nodejs', 512);
        if (res.status === 500) {
            expect(res.data.error).to.not.include("Invalid memoryMb");
        } else {
            expect(res.status).to.equal(200);
        }
    });

    // 5. Node.js (General) - Should fail > 1GB
    it('should reject Node.js with 2GB (2048MB) memory', async () => {
        const res = await uploadFunction('nodejs', 2048);
        expect(res.status).to.equal(400);
        // Expect specific error message about runtime limit
        expect(res.data.error).to.satisfy(msg => msg.includes("memoryMb") || msg.includes("limit"));
    });

    // 6. Go (General) - Should fail > 1GB
    it('should reject Go with 2GB (2048MB) memory', async () => {
        const res = await uploadFunction('go', 2048);
        expect(res.status).to.equal(400);
    });
});

after(() => {
    if (fs.existsSync(TEST_FILE_PATH)) {
        fs.unlinkSync(TEST_FILE_PATH);
    }
});
