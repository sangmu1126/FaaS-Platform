require('dotenv').config();
const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require("@aws-sdk/client-s3");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const Redis = require("ioredis");
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8080;

// AWS Clients
const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const db = new DynamoDBClient({ region: process.env.AWS_REGION });

// Redis Client
console.log("👉 [DEBUG] REDIS_HOST:", process.env.REDIS_HOST);

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: 6379,
    retryStrategy: times => Math.min(times * 50, 2000)
});

redis.on('error', (err) => {
    console.error("❌ Global Redis Error (무시됨):", err.message);
});

redis.on('connect', () => {
    console.log("✅ Global Redis Connected!");
});

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 1. 코드 업로드 (POST /upload)
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.BUCKET_NAME,
        key: function (req, file, cb) {
            const functionId = uuidv4();
            req.functionId = functionId; 
            cb(null, `functions/${functionId}/v1.zip`); 
        }
    })
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "File upload failed or no file provided" });
        }

        // [안전장치] 빈 값 방어 함수
        const safeString = (val, defaultVal) => {
            if (val === undefined || val === null) return defaultVal;
            const str = String(val).trim();
            return str.length > 0 ? str : defaultVal;
        };

        const body = req.body || {};
        
        // 데이터 정제
        const functionId = safeString(req.functionId, uuidv4());
        // req.file.key가 없을 때를 대비해 수동 경로 생성
        const fallbackKey = `functions/${functionId}/v1.zip`;
        const s3Key = safeString(req.file.key, fallbackKey);
        
        const originalName = safeString(req.file.originalname, "unknown_file.zip");
        const description = safeString(body.description, "No description provided");
        const runtime = safeString(body.runtime, "python");

        const itemToSave = {
            functionId: { S: functionId },
            s3Key: { S: s3Key },
            originalName: { S: originalName },
            description: { S: description },
            runtime: { S: runtime },
            uploadedAt: { S: new Date().toISOString() }
        };

        // [DEBUG] DB 저장 데이터 로그 (에러 발생 시 이 로그를 확인하세요)
        console.log("👉 DB Save Item:", JSON.stringify(itemToSave, null, 2));

        if (!process.env.TABLE_NAME) {
            throw new Error("TABLE_NAME is not defined in .env");
        }

        await db.send(new PutItemCommand({
            TableName: process.env.TABLE_NAME,
            Item: itemToSave
        }));

        console.log(`[Upload] Success: ${functionId}`);
        res.json({ success: true, functionId: functionId });

    } catch (error) {
        console.error("❌ Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. 함수 실행 (POST /run)
app.post('/run', async (req, res) => {
    const { functionId, inputData } = req.body || {};
    
    if (!functionId) {
        return res.status(400).json({ error: "functionId is required" });
    }

    const requestId = uuidv4();
    console.log(`[Run] Request: ${requestId} (Func: ${functionId})`);

    try {
        const { Item } = await db.send(new GetItemCommand({
            TableName: process.env.TABLE_NAME,
            Key: { functionId: { S: functionId } }
        }));

        if (!Item) return res.status(404).json({ error: "Function not found" });

        const taskPayload = {
            requestId: requestId,
            functionId: functionId,
            runtime: Item.runtime ? Item.runtime.S : "python", 
            s3Bucket: process.env.BUCKET_NAME,
            s3Key: Item.s3Key ? Item.s3Key.S : "",
            timeoutMs: 5000,
            memoryMb: 256,
            input: inputData || {}
        };

        await sqs.send(new SendMessageCommand({
            QueueUrl: process.env.SQS_URL,
            MessageBody: JSON.stringify(taskPayload)
        }));

        const result = await waitForResult(requestId);
        res.json(result);

    } catch (error) {
        console.error("❌ Run Error:", error);
        res.status(500).json({ error: error.message });
    }
});

function waitForResult(requestId) {
    return new Promise((resolve, reject) => {
        const sub = new Redis({ host: process.env.REDIS_HOST, port: 6379 });
        const channel = `result:${requestId}`;
        let completed = false;

        const timeout = setTimeout(() => {
            if (!completed) {
                cleanup();
                resolve({ status: "TIMEOUT", message: "Execution timed out" });
            }
        }, 25000);

        function cleanup() {
            completed = true;
            clearTimeout(timeout);
            sub.disconnect();
        }

        sub.subscribe(channel);
        sub.on('message', (chn, msg) => {
            if (chn === channel) {
                cleanup();
                try { resolve(JSON.parse(msg)); } catch (e) { resolve({ raw: msg }); }
            }
        });
    });
}

app.listen(PORT, () => {
    // 👇 이 로그가 안 보이면 재시작이 안 된 것입니다.
    console.log(`🚀 NanoGrid Controller v1.1 Started on port ${PORT}`);
    console.log(`   - Mode: EC2 Native (No Lambda)`);
});