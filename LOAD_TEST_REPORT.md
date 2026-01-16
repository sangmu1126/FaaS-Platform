# FaaS Platform Load Testing Report

This document summarizes the comprehensive load testing strategy executed to validate the FaaS platform's **Performance**, **Stability**, and **Security**.

## 🧪 Test Environment & Scenarios

| Scenario | Environment | Virtual Users (VU) | Workload | Objective |
| :--- | :--- | :--- | :--- | :--- |
| **1. Capacity** | Local (Windows/Node) | **50** (Concurrent) | `Heavy Task` (CPU + 0.5s Sleep) | Verify throughput & scheduling overhead. |
| **2. Stress** | Local (Windows/Node) | **200** (Burst) | `Heavy Task` (CPU + 0.5s Sleep) | Verify Rate Limiting & System Stability. |
| **3. Cloud** | **AWS EC2** (Production) | **50** (Remote) | `Heavy Task` (CPU + 0.5s Sleep) | Verify Cloud Execution, Cold Starts & Security. |

---

## 📊 Detailed Results

### 1. Local Capacity Test (Baseline)
Targeting `127.0.0.1:8080`. Simulating high concurrency within hardware limits.

*   **Status**: ✅ **SUCCESS** (All 1,541 requests returned 200 OK)
*   **Latency (P95)**: `510ms`
    *   **Analysis**: Subtracting the intentional 500ms sleep, the system overhead was approx. **10ms**.
    *   **Conclusion**: The custom Warm Pool Scheduler efficiently handled 50 concurrent CPU-intensive tasks without degradation.

### 2. Local Stress Test (Stability)
Targeting `127.0.0.1:8080` with 4x capacity (200 VUs). Simulating DDoS/Traffic Spike.

*   **Status**: ✅ **PROTECTED** (Mixed 200 OK & 429 Too Many Requests)
*   **Response**: `200 OK` (Processed) vs `429` (Body: `{"error":"Too Many Requests"}`)
*   **Analysis**:
    *   The Redis-based Rate Limiter (Lua Script) correctly identified and blocked excess traffic immediately.
    *   Server resources (CPU/Memory) remained stable; no crashes or 500 errors occurred.
    *   **Fast Failure**: Blocked requests were rejected in <150ms, preserving resources for valid requests.

### 3. Cloud Production Test (Real-world)
Targeting AWS EC2 Controller (`13.209.30.223`). Simulating real user traffic.

*   **Status**: ✅ **VERIFIED**
*   **Execution**:
    *   Python `main.py` executed successfully in AWS Worker.
    *   Resources: `6MB` Memory usage (Optimization identified: 128MB -> 10MB).
    *   Latency (P95): `~9s` (Includes Network RTT + SQS Queue + Cold Start + Execution).
*   **Security Verification**:
    *   **Rate Limiting**: Single IP flood was correctly throttled (`429`).
    *   **Spoofing Attempt**: Tried injecting `X-Forwarded-For` with random IPs.
    *   **Result**: request still blocked (`429`), confirming the Controller is configured to **distrust untrusted proxies**, preventing header manipulation attacks.

---

## 💡 Key Technical Validations

1.  **High-Performance Scheduling**:
    *   Achieved **<10ms overhead** per function execution under full local load.
2.  **Robust Defense Mechanisms**:
    *   **Rate Limiter** successfully protects the core system from traffic spikes.
    *   **Graceful Degradation** ensures the system stays online even under 400% load.
3.  **Cloud Native Architecture**:
    *   Successfully orchestrated the full lifecycle: **Upload -> S3 -> DynamoDB -> Controller -> SQS -> EC2 Worker -> Redis -> Result**.
    *   Demonstrated real-world **Cold Start** and **Queueing** characteristics.

## 🛠️ Artifacts
*   **Scripts**: `load_test_k6.js` (Local), `load_test_k6_cloud.js` (Cloud)
*   **Payload**: `heavy_function_cloud.zip` (Python Fibonacci Task)
