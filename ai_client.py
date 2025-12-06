import os
import json
import time
import requests
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry
import sys

class AIClient:
    def __init__(self):
        self.endpoint = os.environ.get("AI_ENDPOINT", "http://10.0.20.100:11434")
        self.default_model = os.environ.get("LLM_MODEL", "llama3:8b")
        self.output_dir = "/output" # Standard path in container
        
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
            # Append to usage file (Thread-safe append)
            usage_file = os.path.join(self.output_dir, ".llm_usage_stats.jsonl")
            
            with open(usage_file, 'a') as f:
                f.write(json.dumps(usage) + "\n")
                
        except Exception as e:
            # Silently fail to not disrupt user code, but could log if possible
            pass

    def generate(self, prompt, model=None, **kwargs):
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
            sys.stderr.write(f"AI Generation Error: {e}\n")
            raise

    def chat(self, messages, model=None, **kwargs):
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
            sys.stderr.write(f"AI Chat Error: {e}\n")
            raise

# Singleton instance
client = AIClient()

def generate(prompt, model=None, **kwargs):
    return client.generate(prompt, model, **kwargs)

def chat(messages, model=None, **kwargs):
    return client.chat(messages, model, **kwargs)
