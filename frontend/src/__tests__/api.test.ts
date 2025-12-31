import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

describe('FaaS API Endpoints', () => {
    describe('Health Check', () => {
        it('should return 200 from health endpoint', async () => {
            const res = await fetch(`${API_BASE.replace('/api', '')}/health`);
            expect(res.status).toBe(200);
        });
    });

    describe('System Status', () => {
        it('should return system status', async () => {
            const res = await fetch(`${API_BASE}/system/status`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('controller');
        });
    });

    describe('Functions API', () => {
        it('should list all functions', async () => {
            const res = await fetch(`${API_BASE}/functions`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(Array.isArray(data.functions || data)).toBe(true);
        });
    });

    describe('Logs API', () => {
        it('should return logs', async () => {
            const res = await fetch(`${API_BASE}/logs`);
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data).toHaveProperty('logs');
        });
    });
});
