import docker
import threading
import structlog
import time
import os
import io
import tarfile
import shlex
from collections import deque
from pathlib import Path
from typing import Dict, Optional, List

import config

logger = structlog.get_logger()

class ContainerManager:
    """
    Manages Docker container lifecycle, including creation, execution, and warm pools.
    """
    def __init__(self, docker_client=None):
        self.docker = docker_client or docker.from_env()
        
        # Runtime-based Warm Pool (Generic)
        self.pools = {
            "python": deque(), "cpp": deque(), "nodejs": deque(), "go": deque()
        }
        
        # Function-specific Warm Pool (Secure & Fast)
        self.function_pools = {} # Key: function_id, Value: List[Container]
        
        # Locks
        self.function_pool_lock = threading.Lock()
        self.pool_locks = {
            k: threading.Lock() for k in ["python", "cpp", "nodejs", "go"]
        }
        
        # Pre-pull images
        self._ensure_images()
        
        # PID Cache (Global)
        self.pid_cache = {}

        # Initialize pools
        self._initialize_warm_pool()

    def _ensure_images(self):
        logger.info("🐳 Pre-pulling Docker images...")
        for runtime, img_name in config.DOCKER_IMAGES.items():
            try:
                self.docker.images.get(img_name)
                logger.debug(f"✓ Image ready: {img_name}")
            except docker.errors.ImageNotFound:
                logger.info(f"📥 Pulling image: {img_name}")
                self.docker.images.pull(img_name)

    def _initialize_warm_pool(self):
        logger.info("🔥 Initializing Warm Pools", counts=config.WARM_POOL_SIZES)
        for runtime, count in config.WARM_POOL_SIZES.items():
            for _ in range(count):
                self._create_warm_container(runtime)

    def _create_warm_container(self, runtime: str) -> str:
        try:
            img = config.DOCKER_IMAGES.get(runtime)
            # Run infinite wait container
            c = self.docker.containers.run(
                img, command="tail -f /dev/null", detach=True,
                # Use Docker's tiny init as PID 1 so orphaned children are
                # adopted and reaped instead of accumulating as zombies.
                init=True,
                network_mode="bridge",
                mem_limit="1024m",
                cpu_quota=100000,
                user="65534:65534",
                cap_drop=["ALL"],
                security_opt=["no-new-privileges:true"],
                pids_limit=128,
                tmpfs={
                    "/workspace": "rw,nosuid,nodev,exec,size=256m,mode=1777",
                    "/output": "rw,nosuid,nodev,exec,size=256m,mode=1777"
                }
            )
            c.pause()
            
            # Cache PID immediately (requires reload since 'run' might not populate attrs fully initially)
            c.reload()
            self.pid_cache[c.id] = c.attrs['State']['Pid']
            
            self.pools[runtime].append(c.id)
            return c.id
        except Exception as e:
            logger.error("Failed to create warm container", runtime=runtime, error=str(e))
            return None

    def get_process_ids(self, container) -> Optional[frozenset]:
        """Return the current container PIDs, or None when inspection fails.

        A snapshot is taken immediately before and after each invocation. Any
        PID added by user code makes the container unsafe to return to a warm
        pool. PID values are sufficient here because the container is leased
        exclusively for the duration of an invocation.
        """
        try:
            process_table = container.top(ps_args="-eo pid=")
            processes = process_table.get("Processes", [])
            return frozenset(
                int(row[0].strip())
                for row in processes
                if row and str(row[0]).strip()
            )
        except Exception as e:
            logger.warning(
                "Failed to inspect container processes",
                container_id=getattr(container, "id", "unknown"),
                error=str(e)
            )
            return None

    def acquire_container(self, runtime: str, function_id: str = None):
        """
        Acquire container with priority:
        1. Function-specific warm pool
        2. Generic runtime pool
        """
        target_runtime = runtime if runtime in self.pools else "python"
        
        # 1. Warm Pool Check
        if function_id:
            with self.function_pool_lock:
                if function_id in self.function_pools and self.function_pools[function_id]:
                    container = self.function_pools[function_id].pop()
                    # Warm Pool items are recycling/running, no need to unpause
                    # try:
                    #     container.unpause()
                    # except Exception: pass
                    logger.info("⚡ Warm Start from function pool", function_id=function_id)
                    container.is_warm = True
                    return container
        
        # 2. Generic Pool Check
        cid = None
        with self.pool_locks[target_runtime]:
            if not self.pools[target_runtime]:
                logger.warning("Pool empty, creating new container synchronously", runtime=target_runtime)
                cid = self._create_warm_container(target_runtime)
                if not cid: raise RuntimeError("Failed to create container")
            
            if self.pools[target_runtime]:
                cid = self.pools[target_runtime].popleft()
                
        if not cid: raise RuntimeError("Failed to acquire container")

        try:
            c = self.docker.containers.get(cid)
            try:
                c.unpause()
            except Exception: pass
            logger.info("🥶 Cold Start from runtime pool", runtime=target_runtime)
            
            # Asynchronously replenish generic pool
            self._replenish_pool(target_runtime)
            
            c.is_warm = False
            return c
        except Exception:
            return self.acquire_container(runtime, function_id)

    def release_container(self, container, function_id: str):
        """Return container to function-specific pool."""
        try:
            with self.function_pool_lock:
                if function_id not in self.function_pools:
                    self.function_pools[function_id] = []
                
                pool = self.function_pools[function_id]
                
                if len(pool) >= config.MAX_POOL_SIZE_PER_FUNC:
                    oldest = pool.pop(0)
                    try:
                        oldest.remove(force=True)
                    except Exception: pass
                
                pool.append(container)
                logger.info("♻️ Container recycled", function_id=function_id, pool_size=len(pool))
        except Exception as e:
            logger.warning("Failed to recycle container", error=str(e))
            try:
                container.remove(force=True)
            except Exception: pass

    def discard_container(self, container):
        """Remove a container that failed before it became safe to reuse."""
        try:
            self.pid_cache.pop(container.id, None)
            container.remove(force=True)
        except Exception as e:
            logger.warning("Failed to discard container", error=str(e))

    def _replenish_pool(self, runtime: str):
        def _create():
            try:
                self._create_warm_container(runtime)
            except Exception as e:
                logger.error("Failed to replenish pool", error=str(e))
        threading.Thread(target=_create, daemon=True).start()

    def update_resources(self, container, memory_mb: int):
        try:
            container.update(mem_limit=f"{memory_mb}m", memswap_limit=f"{memory_mb}m")
        except Exception as e:
            logger.warning("Failed to update container resources", error=str(e))

    def reset_cgroup_peak(self, container_id: str):
        try:
            path = config.CGROUP_PATH_MEMORY_PEAK.format(container_id=container_id)
            if os.path.exists(path):
                with open(path, "w") as f:
                    f.write("reset")
        except Exception: pass

    def get_cgroup_memory_peak(self, container_id: str) -> int:
        try:
            path = config.CGROUP_PATH_MEMORY_PEAK.format(container_id=container_id)
            if os.path.exists(path):
                with open(path, "r") as f:
                    return int(f.read().strip())
        except Exception: pass
        return 0

    def get_io_bytes(self, container_id: str) -> int:
        try:
            path = config.CGROUP_PATH_IO_STAT.format(container_id=container_id)
            total = 0
            if os.path.exists(path):
                with open(path, "r") as f:
                    for line in f:
                        parts = line.split()
                        for p in parts:
                            if p.startswith("r=") or p.startswith("w="):
                                total += int(p.split("=")[1])
            return total
        except Exception:
            return 0

    def copy_to_container(self, container, source_path: Path, target_path: str):
        source_path = Path(source_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Container copy source does not exist: {source_path}")

        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as tar:
            if source_path.is_dir():
                for item in sorted(source_path.iterdir(), key=lambda path: path.name):
                    tar.add(item, arcname=item.name)
            else:
                tar.add(source_path, arcname=source_path.name)

        # Docker's archive API writes to the container root filesystem rather
        # than through a tmpfs mount. Stage the archive in /tmp, then copy it
        # into the mounted workspace from inside the container namespace.
        staging_path = "/tmp/faas-archive-staging"
        container.exec_run(["rm", "-rf", staging_path], user="0")
        container.exec_run(["mkdir", "-p", staging_path], user="0")
        container.exec_run(["mkdir", "-p", target_path], user="0")
        copied = container.put_archive(staging_path, stream.getvalue())
        if not copied:
            raise RuntimeError(f"Docker rejected archive copy for {target_path}")

        copy_command = [
            "sh",
            "-c",
            f"cp -R {shlex.quote(staging_path)}/. {shlex.quote(target_path)}/"
        ]
        result = container.exec_run(copy_command, user="65534:65534")
        exit_code = getattr(result, "exit_code", result[0] if isinstance(result, tuple) else -1)
        container.exec_run(["rm", "-rf", staging_path], user="0")
        if exit_code != 0:
            output = getattr(result, "output", result[1] if isinstance(result, tuple) else b"")
            detail = output.decode("utf-8", errors="replace").strip() if isinstance(output, bytes) else str(output)
            raise RuntimeError(f"Failed to copy staged files to {target_path}: {detail}")

    def verify_files_readable(self, container, file_paths: List[str], user: str = "65534:65534"):
        """Fail if any required runtime file is missing or unreadable in a container."""
        quoted_paths = " ".join(shlex.quote(path) for path in file_paths)
        command = [
            "sh",
            "-c",
            f'for file in {quoted_paths}; do [ -r "$file" ] || {{ echo "missing:$file"; exit 1; }}; done'
        ]
        result = container.exec_run(command, user=user)
        exit_code = getattr(result, "exit_code", result[0] if isinstance(result, tuple) else -1)
        if exit_code != 0:
            output = getattr(result, "output", result[1] if isinstance(result, tuple) else b"")
            detail = output.decode("utf-8", errors="replace").strip() if isinstance(output, bytes) else str(output)
            raise RuntimeError(f"Required container files are unavailable: {detail or file_paths}")

    def copy_from_container(self, container, source_path: str, target_local_path: Path):
        staging_root = "/tmp/faas-output-staging"
        staging_path = f"{staging_root}/output"
        try:
            container.exec_run(["rm", "-rf", staging_root], user="0")
            container.exec_run(["mkdir", "-p", staging_path], user="0")
            container.exec_run(["chmod", "1777", staging_path], user="0")
            copy_result = container.exec_run(
                ["sh", "-c", f"cp -R {shlex.quote(source_path)}/. {staging_path}/"],
                user="65534:65534"
            )
            exit_code = getattr(
                copy_result,
                "exit_code",
                copy_result[0] if isinstance(copy_result, tuple) else -1
            )
            if exit_code != 0:
                raise RuntimeError(f"Failed to stage container output from {source_path}")

            stream, stat = container.get_archive(staging_path)
            temp_tar = target_local_path / "temp_output.tar"
            with open(temp_tar, "wb") as f:
                for chunk in stream:
                    f.write(chunk)
            with tarfile.open(temp_tar, mode='r') as tar:
                tar.extractall(path=target_local_path)
            temp_tar.unlink()
        except Exception as e:
            logger.warning("Failed to copy from container", error=str(e))
        finally:
            try:
                container.exec_run(["rm", "-rf", staging_root], user="0")
            except Exception:
                pass

    def get_cgroup_cpu_usage(self, container_id: str) -> int:
        """Returns CPU usage in microseconds from cgroup v2"""
        try:
            path = config.CGROUP_PATH_CPU_STAT.format(container_id=container_id)
            if os.path.exists(path):
                with open(path, "r") as f:
                    for line in f:
                        if line.startswith("usage_usec"):
                            return int(line.split()[1])
        except Exception: pass
        return 0

    def get_network_stats(self, container) -> tuple:
        """Returns (rx_bytes, tx_bytes) from /proc/{pid}/net/dev"""
        try:
            pid = self.pid_cache.get(container.id)
            if not pid:
                # Fallback
                try:
                    container.reload()
                    pid = container.attrs['State']['Pid']
                    self.pid_cache[container.id] = pid
                except: return 0, 0
            
            if not os.path.exists(f"/proc/{pid}"):
                return 0, 0

            rx = 0
            tx = 0
            path = f"/proc/{pid}/net/dev"
            if os.path.exists(path):
                with open(path, "r") as f:
                    lines = f.readlines()
                    for line in lines[2:]:
                        data = line.strip().split()
                        # face |bytes packets errs...
                        # eth0: 1234 ...
                        # If interface name is fused with bytes (eth0:123), logic needs care.
                        # Linux /proc/net/dev output:
                        # eth0: 123 456 ...
                        # split() handles multiple spaces.
                        # Part 0 is "eth0:" or "eth0". Part 1 is bytes.
                        parts = line.replace(':', ' ').split()
                        if parts[0].startswith("eth"):
                            rx += int(parts[1])
                            tx += int(parts[9])
            return rx, tx
        except Exception as e:
            # logger.warning("Network stat failed", error=str(e))
            return 0, 0

    def get_disk_stats(self, container_id: str) -> tuple:
        """Returns (read_bytes, write_bytes) from io.stat"""
        try:
            path = config.CGROUP_PATH_IO_STAT.format(container_id=container_id)
            read_b = 0
            write_b = 0
            if os.path.exists(path):
                with open(path, "r") as f:
                    for line in f:
                        parts = line.split()
                        for p in parts:
                            if p.startswith("r="): read_b += int(p.split("=")[1])
                            elif p.startswith("w="): write_b += int(p.split("=")[1])
            return read_b, write_b
        except Exception:
            return 0, 0
