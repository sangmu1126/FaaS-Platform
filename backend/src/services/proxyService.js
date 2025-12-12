import { request } from 'undici';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { FormData } from 'undici'; // Undici has built-in FormData in Node 18+ or via import
// Note: Node 18 has global FormData. If undici export is not standard, we use generic FormData construction.
// Actually undici request supports FormData.

export const proxyService = {

    // Smart Upload with Runtime Optimization
    async uploadFunction(file, runtime, functionId, memoryMb) {
        const targetUrl = `${config.awsAlbUrl}/upload`;

        // 1. Runtime Optimization Logic
        let contentType = 'application/octet-stream';
        let filename = file.originalname;

        if (runtime === 'python') {
            contentType = config.runtimes.python.contentType;
            // Force UTF-8 text if it's python script, but usually we upload ZIPs for FaaS. 
            // User Requirement: "Python -> UTF-8 + text/x-python". 
            // Assuming user creates single-file functions or we are enforcing this metadata.
            // If file is zip, we might just pass it. But let's follow spec.
        } else if (runtime === 'cpp') {
            contentType = config.runtimes.cpp.contentType;
        }

        // 2. Construct FormData
        const formData = new global.FormData();

        // We need to append the Buffer. 
        // In Node global FormData, we can pass a Blob.
        const blob = new global.Blob([file.buffer], { type: contentType });
        formData.append('file', blob, filename);

        // Headers for ALB Controller
        const headers = {
            'x-runtime': runtime,
            'x-memory-mb': memoryMb ? memoryMb.toString() : '128',
            'x-api-key': 'test-api-key' // Should be from config
        };

        // 3. Send
        logger.info(`Proxying Upload to ${targetUrl}`, { runtime, contentType });

        const { statusCode, body } = await request(targetUrl, {
            method: 'POST',
            headers, // FormData headers are auto-set by undici/fetch usually? 
            // Wait, undici 'request' with body as FormData works but we need to match spec.
            // Safer to let undici handle multipart boundary if we pass body as FormData.
            body: formData
        });

        if (statusCode >= 400) {
            throw new Error(`ALB returned ${statusCode}: ${await body.text()}`);
        }

        return await body.json();
    },

    // Proxy Execution
    async runFunction(functionId, inputData) {
        const targetUrl = `${config.awsAlbUrl}/run`;

        const { statusCode, body } = await request(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': 'test-api-key'
            },
            body: JSON.stringify({ functionId, inputData })
        });

        const result = await body.json();

        // If ALB is down or 500, we treat result as error
        if (statusCode >= 400) {
            result.error = result.error || "Upstream Error";
            result.status = "ERROR";
        }

        return result;
    },

    // Generic Proxy (GET)
    async fetch(path) {
        const targetUrl = `${config.awsAlbUrl}${path}`;
        const { body } = await request(targetUrl, {
            headers: { 'x-api-key': 'test-api-key' }
        });
        try {
            return await body.json();
        } catch (e) {
            return { error: "Failed to parse JSON from upstream" };
        }
    }
};
