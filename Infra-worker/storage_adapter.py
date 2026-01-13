import os
import shutil
import zipfile
import boto3
import redis
import structlog
from pathlib import Path
from typing import Optional

import config

logger = structlog.get_logger()

class StorageAdapter:
    """
    Handles storage operations: S3 downloading, Redis caching, 
    workspace preparation, and file system cleanup.
    """
    def __init__(self, s3_client=None, redis_client=None):
        self.s3 = s3_client or boto3.client("s3", region_name=config.AWS_REGION)
        
        # Redis connection
        if redis_client:
            self.redis = redis_client
        else:
            try:
                self.redis = redis.Redis(
                    host=config.REDIS_HOST, 
                    port=config.REDIS_PORT, 
                    decode_responses=False
                )
                self.redis.ping()
                logger.info("📦 Redis connected for code caching")
            except Exception as e:
                logger.warning("⚠️ Redis unavailable, falling back to S3 only", error=str(e))
                self.redis = None

    def prepare_workspace(self, request_id: str, function_id: str, s3_key: str, s3_bucket: Optional[str] = None) -> Path:
        """Download code, unzip safely, and return workspace path."""
        local_dir = Path(config.DOCKER_WORK_DIR_ROOT) / request_id
        if local_dir.exists(): shutil.rmtree(local_dir)
        local_dir.mkdir(parents=True, exist_ok=True)
        
        zip_path = local_dir / "code.zip"
        bucket = s3_bucket if s3_bucket else config.S3_CODE_BUCKET
        cache_key = f"code:{function_id}"
        
        # 1. Try Redis cache
        cache_hit = False
        if self.redis:
            try:
                cached_code = self.redis.get(cache_key)
                if cached_code:
                    with open(zip_path, "wb") as f:
                        f.write(cached_code)
                    cache_hit = True
                    logger.info("⚡ Code cache HIT", function_id=function_id)
            except Exception as e:
                logger.warning("Redis cache read failed", error=str(e))
        
        # 2. Cache MISS -> Download from S3
        if not cache_hit:
            logger.info("📥 Code cache MISS, downloading from S3", function_id=function_id)
            self.s3.download_file(bucket, s3_key, str(zip_path))
            
            # 3. Store in Redis
            if self.redis:
                try:
                    with open(zip_path, "rb") as f:
                        self.redis.setex(cache_key, 600, f.read()) # 10 min TTL
                    logger.info("📦 Code cached to Redis", function_id=function_id)
                except Exception as e:
                    logger.warning("Redis cache write failed", error=str(e))
        
        # Unzip safely
        self._unzip_safely(zip_path, local_dir)
        try:
            zip_path.unlink()
        except: pass
        
        return local_dir

    def _unzip_safely(self, zip_path: Path, target_dir: Path):
        """Zip Slip prevention"""
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                target_path = (target_dir / member).resolve()
                if not str(target_path).startswith(str(target_dir.resolve())):
                    logger.warning("Zip Slip attempt detected", file=member)
                    continue
                
                if member.endswith('/'):
                    target_path.mkdir(parents=True, exist_ok=True)
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member) as source, open(target_path, "wb") as dest:
                        shutil.copyfileobj(source, dest)

    def inject_dependencies(self, target_dir: Path):
        """Inject sdk.py and ai_client.py into workspace."""
        try:
            current_dir = Path(__file__).parent
            for file_name in ["sdk.py", "ai_client.py"]:
                src = current_dir / file_name
                if src.exists():
                    shutil.copy(str(src), str(target_dir / file_name))
                else:
                    logger.warning(f"{file_name} not found, skipping injection")
        except Exception as e:
            logger.error("Failed to inject dependencies", error=str(e))

    def cleanup_workspace(self, path: Path):
        if path.exists():
            try:
                shutil.rmtree(path)
            except Exception as e:
                logger.warning("Failed to cleanup workspace", path=str(path), error=str(e))
