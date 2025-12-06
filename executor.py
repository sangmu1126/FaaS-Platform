import os
import shutil
import time
import zipfile
import structlog
import boto3
import docker
from pathlib import Path
from collections import deque
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
from datetime import datetime

logger = structlog.get_logger()

# --- Data Models (기존 models.py 통합) ---
@dataclass
class TaskMessage:
    request_id: str
    function_id: str
    runtime: str
    s3_key: str
    memory_mb: int = 128
    timeout_ms: int = 10000

@dataclass
class ExecutionResult:
    request_id: str
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    peak_memory_bytes: Optional[int] = None
    optimization_tip: Optional[str] = None
    output_files: List[str] = field(default_factory=list)

    def to_dict(self):
        return {
            "requestId": self.request_id,
            "status": "SUCCESS" if self.success else "FAILED",
            "exitCode": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "durationMs": self.duration_ms,
            "peakMemoryBytes": self.peak_memory_bytes,
            "optimizationTip": self.optimization_tip,
            "outputFiles": self.output_files
        }

# --- Service Logic ---

class AutoTuner:
    """메모리 최적화 팁 생성 (기존 docker_service 내부 로직)"""
    @staticmethod
    def analyze(peak_bytes: int, allocated_mb: int) -> Optional[str]:
        if not peak_bytes: return None
        peak_mb = peak_bytes // (1024 * 1024)
        ratio = peak_mb / allocated_mb
        
        if ratio < 0.3:
            rec = max(int(peak_mb * 1.5), 10)
            return f"💡 Tip: 실제 사용량({peak_mb}MB)이 할당량({allocated_mb}MB)보다 훨씬 적습니다. {rec}MB로 줄여 비용을 절감하세요."
        elif ratio > 0.9:
            rec = int(peak_mb * 1.2)
            return f"⚠️ Warning: 메모리가 부족합니다({peak_mb}MB). {rec}MB 이상으로 늘리는 것을 권장합니다."
        return None

class CloudWatchPublisher:
    """CloudWatch 메트릭 전송 (기존 cloudwatch_publisher.py)"""
    def __init__(self, region):
        self.client = boto3.client("cloudwatch", region_name=region)
        
    def publish_peak_memory(self, func_id, runtime, bytes_used):
        try:
            self.client.put_metric_data(
                Namespace="NanoGrid/FunctionRunner",
                MetricData=[{
                    "MetricName": "PeakMemoryBytes",
                    "Dimensions": [{"Name": "FunctionId", "Value": func_id}, {"Name": "Runtime", "Value": runtime}],
                    "Value": float(bytes_used),
                    "Unit": "Bytes",
                    "Timestamp": datetime.utcnow()
                }]
            )
        except Exception as e:
            logger.warning("CloudWatch publish failed", error=str(e))

class TaskExecutor:
    """통합 실행 엔진: S3 다운로드 -> Docker 실행 -> 결과 처리"""
    
    def __init__(self, config: Dict):
        self.cfg = config
        self.docker = docker.from_env()
        self.s3 = boto3.client("s3", region_name=config["AWS_REGION"])
        self.cw = CloudWatchPublisher(config["AWS_REGION"])
        
        # Warm Pool 저장소
        self.pools = {
            "python": deque(), "cpp": deque(), "nodejs": deque()
        }
        self.images = {
            "python": config["DOCKER_PYTHON_IMAGE"],
            "cpp": config["DOCKER_CPP_IMAGE"],
            "nodejs": config["DOCKER_NODEJS_IMAGE"]
        }
        
        # 초기화 시 Warm Pool 생성
        self._initialize_warm_pool()

    def _initialize_warm_pool(self):
        """Warm Pool 초기화 (기존 warm_pool 로직)"""
        counts = {
            "python": int(self.cfg.get("WARM_POOL_PYTHON_SIZE", 0)),
            "cpp": int(self.cfg.get("WARM_POOL_CPP_SIZE", 0)),
            "nodejs": int(self.cfg.get("WARM_POOL_NODEJS_SIZE", 0))
        }
        logger.info("🔥 Initializing Warm Pools", counts=counts)
        
        for runtime, count in counts.items():
            for _ in range(count):
                self._create_warm_container(runtime)

    def _create_warm_container(self, runtime: str) -> str:
        """컨테이너 생성 및 Pause"""
        try:
            img = self.images.get(runtime)
            c = self.docker.containers.run(
                img, command="tail -f /dev/null", detach=True,
                volumes={self.cfg["TASK_BASE_DIR"]: {"bind": self.cfg["DOCKER_WORK_DIR_ROOT"], "mode": "rw"}},
                network_mode="none" # 보안 격리
            )
            c.pause()
            self.pools[runtime].append(c.id)
            return c.id
        except Exception as e:
            logger.error("Failed to create warm container", runtime=runtime, error=str(e))
            return None

    def _acquire_container(self, runtime: str):
        """Warm Pool에서 컨테이너 획득 (Unpause)"""
        if runtime not in self.pools:
            raise ValueError(f"Unsupported runtime: {runtime}")
            
        if not self.pools[runtime]:
            logger.warning("Pool empty, creating new one", runtime=runtime)
            self._create_warm_container(runtime)
            
        cid = self.pools[runtime].popleft()
        try:
            c = self.docker.containers.get(cid)
            c.unpause()
            # 사용했으니 채워놓기 (Async로 하면 더 좋음)
            self._create_warm_container(runtime)
            return c
        except Exception:
            # 실패하면 재시도
            return self._acquire_container(runtime)

    def _prepare_workspace(self, task: TaskMessage) -> Path:
        """S3 다운로드 및 Zip Slip 방지 압축 해제 (기존 s3_service 로직)"""
        local_dir = Path(self.cfg["TASK_BASE_DIR"]) / task.request_id
        if local_dir.exists(): shutil.rmtree(local_dir)
        local_dir.mkdir(parents=True, exist_ok=True)
        
        zip_path = local_dir / "code.zip"
        self.s3.download_file(self.cfg["S3_CODE_BUCKET"], task.s3_key, str(zip_path))
        
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                # Zip Slip 보안 검사
                target_path = (local_dir / member).resolve()
                if not str(target_path).startswith(str(local_dir.resolve())):
                    continue
                zf.extract(member, local_dir)
        
        zip_path.unlink()
        return local_dir

    def _upload_outputs(self, request_id: str, host_dir: Path) -> List[str]:
        """결과 파일 S3 업로드 (기존 output_uploader 로직)"""
        uploaded = []
        output_dir = host_dir / "output"
        if not output_dir.exists(): return []
        
        bucket = self.cfg.get("S3_USER_DATA_BUCKET")
        if not bucket: return []

        for file in output_dir.rglob("*"):
            if file.is_file():
                key = f"outputs/{request_id}/{file.name}"
                self.s3.upload_file(str(file), bucket, key)
                uploaded.append(f"s3://{bucket}/{key}")
        return uploaded

    def run(self, task: TaskMessage) -> ExecutionResult:
        """작업 실행 메인 함수"""
        container = None
        host_work_dir = None
        start_time = time.time()
        
        try:
            # 1. 작업 공간 준비
            host_work_dir = self._prepare_workspace(task)
            container_work_dir = f"{self.cfg['DOCKER_WORK_DIR_ROOT']}/{task.request_id}"

            # 2. 컨테이너 획득
            container = self._acquire_container(task.runtime)
            
            # 3. 실행 커맨드 구성
            cmd = []
            if task.runtime == "python": cmd = ["python", "main.py"]
            elif task.runtime == "cpp": cmd = ["sh", "-c", "g++ main.cpp -o main && ./main"]
            elif task.runtime == "nodejs": cmd = ["node", "index.js"]

            # 4. 실행
            exit_code, (stdout, stderr) = container.exec_run(
                cmd, workdir=container_work_dir, demux=True
            )
            
            stdout = stdout.decode('utf-8') if stdout else ""
            stderr = stderr.decode('utf-8') if stderr else ""
            
            # 5. 메트릭 측정
            stats = container.stats(stream=False)
            usage = stats.get("memory_stats", {}).get("usage", 0)
            
            # 6. Auto-Tuning & CloudWatch
            tip = AutoTuner.analyze(usage, task.memory_mb)
            self.cw.publish_peak_memory(task.function_id, task.runtime, usage)
            
            # 7. 파일 업로드
            uploaded_files = self._upload_outputs(task.request_id, host_work_dir)

            return ExecutionResult(
                request_id=task.request_id,
                success=(exit_code == 0),
                exit_code=exit_code,
                stdout=stdout,
                stderr=stderr,
                duration_ms=int((time.time() - start_time) * 1000),
                peak_memory_bytes=usage,
                optimization_tip=tip,
                output_files=uploaded_files
            )

        except Exception as e:
            logger.error("Execution failed", error=str(e))
            return ExecutionResult(
                request_id=task.request_id, success=False, exit_code=-1,
                stdout="", stderr=str(e), duration_ms=int((time.time() - start_time) * 1000)
            )
            
        finally:
            # 정리: 컨테이너 폐기 (상태 오염 방지), 호스트 파일 삭제
            if container: 
                try: container.remove(force=True)
                except: pass
            if host_work_dir and host_work_dir.exists():
                shutil.rmtree(host_work_dir)