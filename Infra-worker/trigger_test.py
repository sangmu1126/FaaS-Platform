
import os
import sys
import time
import structlog
from dotenv import load_dotenv

# Load env before imports
load_dotenv()

from models import TaskMessage
from executor import TaskExecutor

logger = structlog.get_logger()

def test_warm_pool():
    print("🚀 Initializing TaskExecutor...")
    executor = TaskExecutor()
    
    # Mock Task
    task = TaskMessage(
        request_id="test-req-1",
        function_id="func-1",
        runtime="python",
        s3_key="nothing",
        payload={"foo": "bar"},
        memory_mb=128
    )
    
    # 1. First Run (Cold)
    print("\n[1] Running First Task (Cold)...")
    t1 = time.time()
    result1 = executor.run(task)
    d1 = (time.time() - t1) * 1000
    print(f"Result 1: success={result1.success}, duration={d1:.2f}ms (Reported: {result1.duration_ms}ms)")
    
    # 2. Second Run (Should be Warm)
    print("\n[2] Running Second Task (Warm)...")
    task.request_id = "test-req-2"
    t2 = time.time()
    result2 = executor.run(task)
    d2 = (time.time() - t2) * 1000
    print(f"Result 2: success={result2.success}, duration={d2:.2f}ms (Reported: {result2.duration_ms}ms)")
    
    if d2 < 200:
        print("\n✅ Warm Pool Working!")
    else:
        print("\n❌ Warm Pool FAILED (Too Slow)")

if __name__ == "__main__":
    try:
        test_warm_pool()
    except Exception as e:
        print(f"CRASH: {e}")
