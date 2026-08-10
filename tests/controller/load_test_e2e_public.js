import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.K6_BASE_URL;
const TOKEN = __ENV.K6_BEARER_TOKEN;
const FUNCTION_ID = __ENV.K6_FUNCTION_ID;
// Avoid K6_* names here: k6 reserves several of them for global option overrides.
const RATE = Number(__ENV.FAAS_TEST_RATE || 3);
const DURATION = __ENV.FAAS_TEST_DURATION || '30s';

const completed = new Counter('faas_completed');
const functionSuccess = new Rate('faas_function_success');
const workerDuration = new Trend('faas_worker_duration_ms', true);
const handlerDuration = new Trend('faas_handler_duration_ms', true);

export const options = {
    scenarios: {
        completed_e2e: {
            executor: 'constant-arrival-rate',
            rate: RATE,
            timeUnit: '1s',
            duration: DURATION,
            preAllocatedVUs: Math.max(10, RATE * 3),
            maxVUs: Math.max(30, RATE * 10),
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        faas_function_success: ['rate>0.99'],
    },
};

export function setup() {
    if (!BASE_URL || !TOKEN || !FUNCTION_ID) {
        throw new Error('K6_BASE_URL, K6_BEARER_TOKEN, and K6_FUNCTION_ID are required');
    }
}

export default function () {
    const response = http.post(`${BASE_URL}/run`, JSON.stringify({
        functionId: FUNCTION_ID,
        inputData: { test: true, source: 'k6-e2e-public' },
    }), {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
        },
        timeout: '30s',
        tags: { endpoint: 'run', mode: 'sync-e2e' },
    });

    let result = null;
    try {
        result = response.json();
    } catch (_) {
        // The checks below record a malformed response as a failed execution.
    }

    const succeeded = response.status === 200 && result?.status === 'SUCCESS';
    functionSuccess.add(succeeded);
    if (succeeded) {
        completed.add(1);
        if (Number.isFinite(result.durationMs)) workerDuration.add(result.durationMs);
        if (Number.isFinite(result.handlerDurationMs)) handlerDuration.add(result.handlerDurationMs);
    }

    check(response, {
        'HTTP 200': (r) => r.status === 200,
        'function completed successfully': () => succeeded,
    });
}
