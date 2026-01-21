import http from 'k6/http';
import { check } from 'k6';

export const options = {
    // 3. 안정적인 300 RPS 유지 (Controller 한계 내)
    scenarios: {
        constant_request_rate: {
            executor: 'constant-arrival-rate',
            rate: 300,
            timeUnit: '1s',
            duration: '30s',
            preAllocatedVUs: 100,
            maxVUs: 200,
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'], // 1% 미만 실패
        http_req_duration: ['p(95)<2000'], // 2초 이내 응답
    },
};

export default function () {
    // NOTE: Ensure this functionId exists in the Controller!
    // If not, use the upload logic from load_test_max_capacity.js or upload manually.
    const payload = JSON.stringify({
        functionId: "f910e673-ff30-4bf7-8efd-dab6622ba62b", // 아까 성공한 ID
        inputData: { name: 'K6 Optimized' }
    });

    const params = {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key',
            'x-async': 'true',
        },
        timeout: '180s' // 클라이언트 타임아웃 대폭 증가
    };

    const res = http.post('http://127.0.0.1:8080/api/run', payload, params);

    check(res, {
        'Status is 202': (r) => r.status === 202,
    });
}
