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
const VERSION = "v2.1";

// 필수 환경변수 검증
const REQUIRED_ENV = ['AWS_REGION', 'BUCKET_NAME', 'TABLE_NAME', 'SQS_URL', 'REDIS_HOST', 'NANOGRID_API_KEY'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`❌ FATAL: Missing environment variables: ${missingEnv.join(', ')}`);
    process.exit(1);
}

// AWS Clients
const s3 = new S3Client({ region: process.env.AWS_REGION });
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const db = new DynamoDBClient({ region: process.env.AWS_REGION });

// Redis Client
console.log("👉 [DEBUG] REDIS_HOST:", process.env.REDIS_HOST);

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: 6379,
    retryStrategy: times => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null
});

let isRedisConnected = false;

redis.on('error', (err) => {
    isRedisConnected = false;
    console.error("❌ Global Redis Error (Reconnecting...):", err.message);
});

redis.on('connect', () => {
    isRedisConnected = true;
    console.log("✅ Global Redis Connected!");
});

app.use(express.json());

// [Security Middleware 1] 인증 (Authentication)
const authenticate = (req, res, next) => {
    const clientKey = req.headers['x-api-key'];
    const serverKey = process.env.NANOGRID_API_KEY;

    if (!clientKey || clientKey !== serverKey) {
        console.warn(`⛔ Unauthorized access attempt from ${req.ip}`);
        return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
    }
    next();
};

//  [Security Middleware 2] 속도 제한 (Rate Limiting via Redis)
// 1분(60초)에 최대 100회 요청 허용
const RATE_LIMIT_WINDOW = 60; 
const RATE_LIMIT_MAX = 100;

const rateLimiter = async (req, res, next) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        const key = `ratelimit:${ip}`;
        
        // Redis Transaction: 카운터 증가 + 만료시간 설정
        const current = await redis.incr(key);
        
        if (current === 1) {
            await redis.expire(key, RATE_LIMIT_WINDOW);
        }

        // 헤더에 남은 횟수 정보 제공 (친절함)
        res.set('X-RateLimit-Limit', RATE_LIMIT_MAX);
        res.set('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - current));

        if (current > RATE_LIMIT_MAX) {
            console.warn(`🔥 Rate limit exceeded for IP: ${ip}`);
            return res.status(429).json({ 
                error: "Too Many Requests", 
                message: "Please slow down. You have exceeded the rate limit." 
            });
        }
        
        next();
    } catch (error) {
        // Redis 에러가 나도 비즈니스 로직은 돌아가게 통과 (Fail Open)
        console.error("⚠️ Rate Limiter Error:", error.message);
        next();
    }
};

// 0. 상세 헬스 체크
app.get('/health', (req, res) => {
    const status = isRedisConnected ? 200 : 503;
    res.status(status).json({
        status: isRedisConnected ? 'OK' : 'ERROR',
        redis: isRedisConnected,
        version: VERSION,
        uptime: process.uptime()
    });
});

// 1. 코드 업로드 -> 인증 + 속도제한
app.post('/upload', authenticate, rateLimiter, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "File upload failed or no file provided" });
        }

        const safeString = (val, defaultVal) => {
            if (val === undefined || val === null) return defaultVal;
            const str = String(val).trim();
            return str.length > 0 ? str : defaultVal;
        };

        const body = req.body || {};
        const functionId = safeString(req.functionId, uuidv4());
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

        console.log("👉 DB Save Item:", JSON.stringify(itemToSave, null, 2));

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

// 2. 함수 실행 -> 인증 + 속도제한
app.post('/run', authenticate, rateLimiter, async (req, res) => {
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
        const sub = new Redis({ 
            host: process.env.REDIS_HOST, 
            port: 6379,
            retryStrategy: null 
        });
        
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
            try {
                sub.disconnect();
            } catch (e) { /* ignore */ }
        }

        sub.subscribe(channel, (err) => {
            if (err) {
                cleanup();
                resolve({ status: "ERROR", message: "Redis subscribe failed" });
            }
        });

        sub.on('message', (chn, msg) => {
            if (chn === channel) {
                cleanup();
                try { resolve(JSON.parse(msg)); } catch (e) { resolve({ raw: msg }); }
            }
        });
    });
}

const server = app.listen(PORT, () => {
    console.log(`🚀 NanoGrid Controller ${VERSION} Started on port ${PORT}`);
    console.log(`   🔒 Security: API Key Auth + Redis Rate Limiting Enabled`);
    console.log(`   - Mode: EC2 Native (No Lambda)`);
});

const gracefulShutdown = () => {
    console.log('Received kill signal, shutting down gracefully');
    server.close(() => {
        console.log('Closed out remaining connections');
        redis.quit();
        process.exit(0);
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);