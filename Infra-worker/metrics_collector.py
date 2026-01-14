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
    def analyze(metrics: dict) -> Tuple[Optional[str], Optional[str], Optional[int]]:
        """
        Analyzes execution metrics to provide optimization tips, savings, and recommended config.
        """
        peak_bytes = metrics.get('peak_memory', 0)
        allocated_mb = metrics.get('allocated_mb', 128)
        duration_ms = metrics.get('duration_ms', 1000)
        cpu_us = metrics.get('cpu_usage', 0)
        net_bytes = metrics.get('network_bytes', 0)
        disk_bytes = metrics.get('disk_bytes', 0)

        if not peak_bytes: return None, None, None
        if allocated_mb <= 0: allocated_mb = 128
        
        peak_mb = peak_bytes / (1024 * 1024)
        mem_ratio = peak_mb / allocated_mb
        
        # CPU Utilization (0.0 - 1.0+)
        # cpu_us is total CPU time in microseconds across all cores
        # duration_ms is wall clock time
        # If multi-threaded, util can be > 1.0
        cpu_util = 0.0
        if duration_ms > 0:
            cpu_util = (cpu_us / 1000.0) / duration_ms
            
        tip = None
        rec_mb = None
        status = "optimal" # optimal, waste, risk
        
        # --- 1. Memory Analysis ---
        if mem_ratio < 0.3:
            # Resource Waste
            rec_mb = max(int(peak_mb * 2.0), 32) # 2x buffer, min 32MB
            if rec_mb < allocated_mb:
                saved_percent = int((1 - (rec_mb / allocated_mb)) * 100)
                tip = f"💡 Resource Waste: Usage ({int(peak_mb)}MB) is low. Reduce to {rec_mb}MB to save {saved_percent}%."
                status = "waste"
        
        elif mem_ratio > 0.85:
            # Memory Risk
            rec_mb = int(peak_mb * 1.2)
            tip = f"⚠️ Memory Risk: Usage ({int(peak_mb)}MB) is dangerously high ({int(mem_ratio*100)}%). Increase to {rec_mb}MB."
            status = "risk"

        # --- 2. CPU / Performance Analysis ---
        cpu_msg = ""
        if cpu_util > 0.8:
            cpu_msg = "🚀 CPU Bound: High computation load. Increasing memory (CPU) may improve speed."
        elif cpu_util < 0.2 and duration_ms > 500:
             # I/O Bound detection
             if net_bytes > 5 * 1024 * 1024:
                 cpu_msg = "🐢 I/O Bound: High network traffic detected. Consider async processing."
             elif disk_bytes > 10 * 1024 * 1024:
                 cpu_msg = "💾 I/O Bound: High disk I/O detected. Check file operations."
             else:
                 cpu_msg = "🐢 I/O Bound: Low CPU but slow execution. Waiting on external latency?"
        
        # Combine Messages
        if cpu_msg:
            if tip:
                tip = f"{tip} | {cpu_msg}"
            else:
                tip = f"💡 {cpu_msg}"
            
        # --- 3. Savings Calculation ---
        savings_str = None
        if rec_mb and rec_mb < allocated_mb:
            diff = allocated_mb - rec_mb
            monthly = diff * config.COST_PER_MB_HOUR * 730
            savings_str = f"${monthly:.2f}/month"

        return tip, savings_str, rec_mb

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

    def analyze_execution(self, metrics: dict):
        return AutoTuner.analyze(metrics)
