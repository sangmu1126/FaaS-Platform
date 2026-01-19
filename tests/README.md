# FaaS Platform Tests

This directory contains the verification and benchmark tests for the FaaS Platform.
The tests are organized by their **execution environment**.

## 📂 Directory Structure

### `tests/worker/` (Worker Node Internal)
Tests that must be run **inside the Linux Worker node**.
They interact directly with the OS, Cgroup, Docker, or Executor internals.

- `benchmark_cgroup.py`: **[Deep Tech]** Comprehensive Cgroup benchmark (Docker API vs Direct).
- `benchmark_simple.py`: Simple version of the Cgroup benchmark.
- `mock_executor.py`: Mock tests for the Executor logic.

### `tests/controller/` (Controller / Client)
Tests that verify the **Service / API** from the outside.
Run these from the Controller node, your local machine, or CI environment.

- `verify_latency.js`: **[Deep Tech]** Measures Warm vs Cold Start latency.
- `verify_scaling.js`: **[Deep Tech]** Verifies concurrency scaling and stability.
- `security_breakout.py`: **[Deep Tech]** Verifies isolation by attempting to access host files.
- `e2e_full.js`: End-to-End full system test.
- `load_test_*.js`: Various K6/custom load tests.

### `tests/unit/` (Unit Tests)
Logic verification tests that run anywhere (Mocked).

- `test_sdk.py`: SDK logic tests.
- `test_metadata.py`: Metadata service tests.

## 🚀 How to Run

### 1. Prerequisites
```bash
cd tests
# Install Node.js dependencies (for controller tests)
npm install
# Install Python dependencies
pip install docker requests
```

### 2. Running Worker Tests (on Worker Node)
```bash
python3 tests/worker/benchmark_simple.py
```

### 3. Running Controller Tests
```bash
export API_URL="http://localhost:8080"
node tests/controller/verify_latency.js
python3 tests/controller/security_breakout.py
```
