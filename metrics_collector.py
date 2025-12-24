import boto3
import structlog
import threading
import os
from datetime import datetime
from typing import Tuple, Optional

import config

logger = structlog.get_logger()

class AutoTuner:
    @staticmethod
    def analyze(peak_bytes: int, allocated_mb: int, io_bytes: int = 0) -> Tuple[Optional[str], Optional[str]]:
        if not peak_bytes: return None, None
        if allocated_mb <= 0: allocated_mb = 128
        
        peak_mb = peak_bytes / (1024 * 1024)
        io_mb = io_bytes / (1024 * 1024)
        
        tip = None
        ratio = peak_mb / allocated_mb
        
        if ratio < 0.3:
            rec = max(int(peak_mb * 1.5), 10)
            saved_percent = int((1 - (rec / allocated_mb)) * 100)
            if saved_percent > 0:
                tip = f"💡 Tip: Actual usage ({int(peak_mb)}MB) is much less than allocated ({allocated_mb}MB). Reduce to {rec}MB to save approx {saved_percent}%."
        elif ratio > 0.9:
            rec = int(peak_mb * 1.2)
            tip = f"⚠️ Warning: Memory tight ({int(peak_mb)}MB). Recommend increasing to {rec}MB+."
        elif allocated_mb <= 128 and ratio > 0.5:
            tip = f"💡 Tip: 초기화(Init) 과정을 제외하면 실제 코드는 훨씬 적은 메모리를 사용합니다. 하지만 안정적인 실행을 위해 현재 수준({allocated_mb}MB)을 유지하는 것을 권장합니다."
            
        if not tip and io_mb > 50:
            tip = f"⚠️ High I/O ({int(io_mb)}MB) detected. Consider caching data."

        wasted_mb = allocated_mb - peak_mb
        estimated_savings = None
        if wasted_mb > 0:
            monthly_saving = wasted_mb * config.COST_PER_MB_HOUR * 730
            estimated_savings = f"${monthly_saving:.2f}/month (if rightsized from {allocated_mb}MB)"
            
        return tip, estimated_savings

class CloudWatchPublisher:
    def __init__(self, region):
        self.client = boto3.client("cloudwatch", region_name=region)
        
    def publish_peak_memory(self, func_id, runtime, bytes_used):
        try:
            if bytes_used is None: return
            self.client.put_metric_data(
                Namespace="FaaS/FunctionRunner",
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

class MetricsCollector:
    """
    Centralizes business logic for observability: 
    Concurrency limits, Auto-Tuning, and CloudWatch metrics.
    """
    def __init__(self, region: str):
        self.cw = CloudWatchPublisher(region)
        self.global_limit = self._init_global_semaphore()
        
    def _init_global_semaphore(self):
        try:
            total_bytes = os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
            total_mb = total_bytes / (1024 * 1024)
        except Exception as e:
            logger.warning("Failed to detect RAM, using default", error=str(e))
            total_mb = 2048

        if total_mb < 4096:
            reserved_mb = total_mb * 0.4
        else:
            reserved_mb = 1536

        available_mb = total_mb - reserved_mb
        limit = int(available_mb // 128)
        limit = max(1, min(limit, 500))

        logger.info("Dynamic Limit Configured", 
                    host_ram_mb=int(total_mb), 
                    reserved_mb=int(reserved_mb), 
                    concurrency_limit=limit)
        return threading.Semaphore(limit)

    def analyze_execution(self, peak_bytes, allocated_mb, io_bytes):
        return AutoTuner.analyze(peak_bytes, allocated_mb, io_bytes)
