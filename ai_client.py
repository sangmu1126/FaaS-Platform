import os
import json
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

class AIClient:
    def __init__(self):
        self.endpoint = os.environ.get("AI_ENDPOINT", "http://10.0.20.100:11434")
        self.default_model = os.environ.get("LLM_MODEL", "llama3:8b")
        self.output_dir = "/output"

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

    def _record_usage(self, response_data):
        """Record token usage to a file for the Executor to pick up."""
        try:
            usage = {
                "prompt_eval_count": response_data.get("prompt_eval_count", 0),
                "eval_count": response_data.get("eval_count", 0)
            }
            usage_file = os.path.join(self.output_dir, ".llm_usage_stats.json")
            
            current_total = {"prompt_eval_count": 0, "eval_count": 0}
            if os.path.exists(usage_file):
                with open(usage_file, 'r') as f:
                    try:
                        current_total = json.load(f)
                    except:
                        pass
            
            current_total["prompt_eval_count"] += usage["prompt_eval_count"]
            current_total["eval_count"] += usage["eval_count"]
            
            with open(usage_file, 'w') as f:
                json.dump(current_total, f)
                
        except Exception as e:
            pass

    def generate(self, prompt, model=None, **kwargs):
        """Generate text from the LLM API."""
        model = model or self.default_model
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            **kwargs
        }
        
        try:
            res = self.session.post(f"{self.endpoint}/api/generate", json=payload)
            res.raise_for_status()
            data = res.json()
            self._record_usage(data)
            return data.get("response", "")
        except Exception as e:
            print(f"AI Generation Error: {e}")
            raise

    def chat(self, messages, model=None, **kwargs):
        """Chat with the LLM API using messages format."""
        model = model or self.default_model
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            **kwargs
        }
        
        try:
            res = self.session.post(f"{self.endpoint}/api/chat", json=payload)
            res.raise_for_status()
            data = res.json()
            self._record_usage(data)
            return data.get("message", {}).get("content", "")
        except Exception as e:
            print(f"AI Chat Error: {e}")
            raise
