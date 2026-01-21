import time
import threading
import queue

# Simulation Params
TOTAL_TASKS = 100
EXECUTION_TIME = 0.030   # 30ms (Pure execution)
UPLOAD_TIME = 0.500      # 500ms (S3 Upload)
MONITOR_TIME = 0.200     # 200ms (CloudWatch)

print(f"=== Throughput Simulation (Tasks: {TOTAL_TASKS}) ===")
print(f"Task: Exec({EXECUTION_TIME*1000}ms) + Upload({UPLOAD_TIME*1000}ms) + Monitor({MONITOR_TIME*1000}ms)\n")

# 1. Sync Mode (Blocking)
def run_sync():
    start = time.perf_counter()
    for _ in range(TOTAL_TASKS):
        time.sleep(EXECUTION_TIME)  # Execute
        time.sleep(UPLOAD_TIME)     # S3 Wait
        time.sleep(MONITOR_TIME)    # CW Wait
    end = time.perf_counter()
    return end - start

duration_sync = run_sync()
tps_sync = TOTAL_TASKS / duration_sync
print(f"[Sync Mode] Duration: {duration_sync:.2f}s | TPS: {tps_sync:.2f}")

# 2. Async Mode (Fire-and-Forget)
# Worker thread simulates background uploads
upload_queue = queue.Queue()
def background_worker():
    while True:
        task = upload_queue.get()
        if task is None: break
        time.sleep(UPLOAD_TIME + MONITOR_TIME) # Simulate Background I/O
        upload_queue.task_done()

bg_thread = threading.Thread(target=background_worker)
bg_thread.start()

def run_async():
    start = time.perf_counter()
    for _ in range(TOTAL_TASKS):
        time.sleep(EXECUTION_TIME)      # Execute
        upload_queue.put(1)             # Offload to background
    end = time.perf_counter()
    return end - start

duration_async = run_async()
tps_async = TOTAL_TASKS / duration_async
print(f"[Async Mode] Duration: {duration_async:.2f}s | TPS: {tps_async:.2f}")

# Cleanup
upload_queue.put(None)
bg_thread.join()

print("\n=== Result ===")
print(f"Improvement: {tps_async / tps_sync:.1f}x Faster")
