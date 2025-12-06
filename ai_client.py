import os
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

class AIClient:
    def __init__(self):
        self.endpoint = os.environ.get("AI_ENDPOINT", "http://10.0.20.100:11434")
        self.default_model = os.environ.get("LLM_MODEL", "llama3:8b")
        self.output_dir = "/output"  # Standard path in container
        
        # Retry Strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session = requests.Session()
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
