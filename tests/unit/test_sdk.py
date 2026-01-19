import unittest
import shutil
import os
import sys
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

# --- Mock Modules Setup (Must be before import) ---
sys.modules["docker"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["structlog"] = MagicMock()

# Fix path to import executor
sys.path.insert(0, str(Path(__file__).parent.parent / "Infra-worker"))

from executor import TaskExecutor, TaskMessage
# Import the SDK directly to test its logic
import sdk

class TestFaaSSDK(unittest.TestCase):
    def setUp(self):
        self.mock_config = {"DOCKER_WORK_DIR_ROOT": "/tmp/test_work_sdk", "AWS_REGION": "us-east-1", "S3_CODE_BUCKET": "test-bucket"}
        self.executor = TaskExecutor(self.mock_config)
        self.executor.s3 = MagicMock()
        
        self.work_dir = Path("/tmp/test_work_sdk/req-sdk")
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
        self.sdk_path = Path(__file__).parent.parent / "Infra-worker" / "sdk.py"
        
        # Reset SDK singleton state
        sdk._sdk._input_data = None

    def tearDown(self):
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir)
            
    def test_sdk_injection(self):
        """Verify sdk.py is injected into workspace"""
        task = TaskMessage(
            request_id="req-sdk", function_id="func-sdk", runtime="python", s3_key="key"
        )
        
        # Mock S3 download (create dummy file)
        def mock_download(bucket, key, path):
            zip_path = Path(path)
            # Create a valid empty zip
            import zipfile
            with zipfile.ZipFile(zip_path, 'w') as zf:
                zf.writestr('main.py', 'print("hello")')
                
        self.executor.s3.download_file.side_effect = mock_download
        
        # Execute prepare_workspace
        workspace = self.executor._prepare_workspace(task)
        
        # Check if sdk.py exists in workspace
        injected_sdk = workspace / "sdk.py"
        self.assertTrue(injected_sdk.exists(), "sdk.py should be injected")
        
        # Verify content matches
        with open(self.sdk_path, 'r') as original, open(injected_sdk, 'r') as injected:
            self.assertEqual(original.read(), injected.read(), "Injected content should match original")

    def test_sdk_logic(self):
        """Verify SDK helper functions work with env vars"""
        # 1. Test Context
        env = {
            "JOB_ID": "job-123",
            "FUNCTION_ID": "func-abc",
            "MEMORY_MB": "2048",
            "LLM_MODEL": "gpt-4",
            "PAYLOAD": '{"message": "hello"}'
        }
        
        with patch.dict(os.environ, env):
            ctx = sdk.get_context()
            self.assertEqual(ctx["request_id"], "job-123")
            self.assertEqual(ctx["memory_mb"], "2048")
            
            inp = sdk.get_input()
            self.assertEqual(inp["message"], "hello")
            
    def test_sdk_file_payload(self):
        """Verify SDK handles file-based payload"""
        payload_file = self.work_dir / "payload.json"
        with open(payload_file, "w") as f:
            json.dump({"data": "large_data"}, f)
            
        env = {
            "PAYLOAD_FILE": str(payload_file)
        }
        
        # Reset internal state of SDK singleton
        sdk._sdk._input_data = None
        
        with patch.dict(os.environ, env):
            inp = sdk.get_input()
            self.assertEqual(inp["data"], "large_data")

if __name__ == '__main__':
    unittest.main()
