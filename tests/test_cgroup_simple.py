import time
import docker
import os

print("=== Metrics Collection Benchmark (Simple) ===\n")

# 1. Direct Cgroup/Proc Read (Self)
print("1. Direct Cgroup/Proc Read (Self):")
start = time.perf_counter()
for _ in range(10000):
    with open("/proc/self/statm") as f:
        f.read()
end = time.perf_counter()
cgroup_ms = (end - start) / 10000 * 1000
print(f"   /proc/self/statm: {cgroup_ms:.6f} ms per read")

# 2. Docker API & Container Cgroup
print("\n2. Docker API stats() vs Direct Container Read:")
try:
    client = docker.from_env()
    containers = client.containers.list()
    
    if containers:
        c = containers[0]
        print(f"   Target Container: {c.name} ({c.id[:12]})")
        
        # Docker API
        # Note: stats() is slow, so we run fewer iterations
        start = time.perf_counter()
        for _ in range(100): 
            stats = c.stats(stream=False)
        end = time.perf_counter()
        docker_ms = (end - start) / 100 * 1000
        print(f"   stats(): {docker_ms:.2f} ms per call")
        
        # Direct Container Cgroup Read
        # Try a few common paths for cgroup v2 and v1
        cgroup_paths = [
            f"/sys/fs/cgroup/docker/{c.id}/memory.current",
            f"/sys/fs/cgroup/memory/docker/{c.id}/memory.usage_in_bytes",
            f"/sys/fs/cgroup/system.slice/docker-{c.id}.scope/memory.current"
        ]
        
        target_path = None
        for p in cgroup_paths:
            if os.path.exists(p):
                target_path = p
                break
        
        container_cgroup_ms = 0
        if target_path:
            start = time.perf_counter()
            for _ in range(10000):
                with open(target_path) as f:
                    f.read()
            end = time.perf_counter()
            container_cgroup_ms = (end - start) / 10000 * 1000
            print(f"   Direct Cgroup Read: {container_cgroup_ms:.6f} ms per read")
        else:
            print(f"   (Cgroup file not found, checked paths...)")
            # If we can't find the container file, use the self-read as proxy for comparison
            container_cgroup_ms = cgroup_ms 
        
        print("\n=== 결과 ===")
        print(f"Direct Cgroup: {container_cgroup_ms:.4f} ms")
        print(f"Docker API:    {docker_ms:.2f} ms")
        if container_cgroup_ms > 0:
            print(f"성능 향상: {docker_ms / container_cgroup_ms:.0f}x 빠름")
            
    else:
        print("   (No running containers found for Docker comparison)")

except Exception as e:
    print(f"   (Docker Check Failed: {e})")
