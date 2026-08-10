import docker
import threading
import structlog
import time
import os
import io
import tarfile
import shlex
import socket
import shutil
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
        
        # Artifact-specific Warm Pool (function + runtime + deployed S3 key).
        # A function ID survives code updates, so it is not a safe pool key by
        # itself: reusing it could execute an older deployment.
        self.function_pools = {}
        
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
                read_only=True,
                network_mode="bridge",
                mem_limit="1024m",
                cpu_quota=100000,
                user="65534:65534",
                cap_drop=["ALL"],
                security_opt=["no-new-privileges:true"],
                pids_limit=128,
                tmpfs={
                    "/workspace": "rw,nosuid,nodev,exec,size=256m,mode=1777",
                    "/output": "rw,nosuid,nodev,exec,size=256m,mode=1777",
                    "/tmp": "rw,nosuid,nodev,exec,size=128m,mode=1777"
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
            # Keep the PID column header. Docker's /containers/{id}/top API
            # locates the PID field from the ps header and returns HTTP 500
            # when the trailing '=' suppresses it ("Couldn't find PID field").
            process_table = container.top(ps_args="-eo pid")
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

    @staticmethod
    def _function_pool_key(function_id: str, runtime: str, artifact_id: str):
        return function_id, runtime, artifact_id

    def _discard_stale_function_pools(self, function_id: str, runtime: str, artifact_id: str):
        """Remove containers belonging to superseded deployments."""
        active_key = self._function_pool_key(function_id, runtime, artifact_id)
        stale_containers = []
        with self.function_pool_lock:
            stale_keys = [
                key for key in self.function_pools
                if key[0] == function_id and key != active_key
            ]
            for key in stale_keys:
                stale_containers.extend(self.function_pools.pop(key))

        for stale in stale_containers:
            self.discard_container(stale)

    def acquire_container(self, runtime: str, function_id: str = None, artifact_id: str = ""):
        """
        Acquire container with priority:
        1. Function-specific warm pool
        2. Generic runtime pool
        """
        target_runtime = runtime if runtime in self.pools else "python"
        
        # 1. Warm Pool Check
        if function_id:
            self._discard_stale_function_pools(function_id, target_runtime, artifact_id)
            pool_key = self._function_pool_key(function_id, target_runtime, artifact_id)
            with self.function_pool_lock:
                if pool_key in self.function_pools and self.function_pools[pool_key]:
                    container = self.function_pools[pool_key].pop()
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
            return self.acquire_container(runtime, function_id, artifact_id)

    def release_container(self, container, function_id: str, runtime: str, artifact_id: str = ""):
        """Return container to function-specific pool."""
        try:
            pool_key = self._function_pool_key(function_id, runtime, artifact_id)
            with self.function_pool_lock:
                if pool_key not in self.function_pools:
                    self.function_pools[pool_key] = []
                
                pool = self.function_pools[pool_key]
                
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

        # Docker's archive-copy endpoint rejects containers whose rootfs is
        # read-only, even when the destination itself is a writable tmpfs.
        # Stream the archive through exec stdin and extract it from inside the
        # container namespace instead. User code never receives a host mount.
        self._extract_archive_via_exec(
            container,
            stream.getvalue(),
            target_path,
            user="65534:65534"
        )

    def _extract_archive_via_exec(self, container, archive_bytes: bytes, target_path: str, user: str):
        api = self.docker.api
        created = api.exec_create(
            container.id,
            ["tar", "-xf", "-", "-C", target_path],
            stdin=True,
            stdout=True,
            stderr=True,
            user=user
        )
        exec_id = created.get("Id") if isinstance(created, dict) else created
        if not exec_id:
            raise RuntimeError(f"Docker failed to create archive extraction exec for {target_path}")

        stream = api.exec_start(exec_id, socket=True)
        raw_socket = getattr(stream, "_sock", stream)
        output = bytearray()
        try:
            raw_socket.sendall(archive_bytes)
            raw_socket.shutdown(socket.SHUT_WR)
            while True:
                chunk = raw_socket.recv(64 * 1024)
                if not chunk:
                    break
                output.extend(chunk)
        finally:
            stream.close()

        inspection = api.exec_inspect(exec_id)
        exit_code = inspection.get("ExitCode")
        if exit_code != 0:
            detail = bytes(output).decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"Failed to extract archive into {target_path}: {detail or f'exit code {exit_code}'}"
            )

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
        temp_tar = target_local_path / "temp_output.tar"
        try:
            # Docker get_archive cannot see files created inside a tmpfs when
            # the container rootfs is read-only. Create the tar from inside
            # the namespace and stream its stdout back to the host instead.
            archive_result = container.exec_run(
                ["tar", "-cf", "-", "-C", source_path, "."],
                stream=True,
                user="65534:65534"
            )
            output_stream = getattr(
                archive_result,
                "output",
                archive_result[1] if isinstance(archive_result, tuple) else archive_result
            )
            with open(temp_tar, "wb") as f:
                for chunk in output_stream:
                    f.write(chunk)
            with tarfile.open(temp_tar, mode='r') as tar:
                self._extract_output_tar_safely(tar, target_local_path)
        except Exception as e:
            logger.warning("Failed to copy from container", error=str(e))
        finally:
            try:
                temp_tar.unlink()
            except OSError:
                pass

    @staticmethod
    def _extract_output_tar_safely(archive: tarfile.TarFile, target_dir: Path):
        """Extract regular files/directories without trusting user tar metadata."""
        root = Path(target_dir).resolve()
        for member in archive.getmembers():
            destination = (root / member.name).resolve()
            try:
                destination.relative_to(root)
            except ValueError as exc:
                raise ValueError(f"Unsafe output path: {member.name}") from exc

            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise ValueError(f"Unsupported output entry: {member.name}")

            destination.parent.mkdir(parents=True, exist_ok=True)
            source = archive.extractfile(member)
            if source is None:
                raise ValueError(f"Unreadable output entry: {member.name}")
            with source, open(destination, "wb") as output_file:
                shutil.copyfileobj(source, output_file)

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
