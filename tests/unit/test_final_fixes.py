
import unittest
import json
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from unittest.mock import MagicMock, patch
import sys

# --- Mock Modules Setup (Must be before import) ---
sys.modules["docker"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["structlog"] = MagicMock()

# Fix path
sys.path.insert(0, str(Path(__file__).parent.parent / "Infra-worker"))

# Import target class
from executor import TaskExecutor, TaskMessage

class TestPayloadLogic(unittest.TestCase):
    def setUp(self):
        self.mock_config = {"DOCKER_WORK_DIR_ROOT": "/tmp/test_work", "AWS_REGION": "us-east-1"}
        self.executor = TaskExecutor(self.mock_config)
        
        # Mocks
        self.executor.docker = MagicMock()
        self.executor.s3 = MagicMock()
        self.executor.pools = {"python": MagicMock()} # avoid init issues
        self.executor.pool_locks = {"python": MagicMock()}
        
        # Determine working dir
        self.work_dir = Path("/tmp/test_work/req-123")
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
        # Add output dir
        (self.work_dir / "output").mkdir(exist_ok=True)

    def tearDown(self):
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir)

    def test_run_large_payload(self):
        """Test large payload uses file instead of env var"""
        # Create > 100KB payload
        large_payload = {"data": "A" * (100 * 1024 + 10)} 
        task = TaskMessage(
            request_id="req-123", function_id="func-1", runtime="python", s3_key="key", payload=large_payload
        )
        
        # Mock methods to isolate run logic part
        self.executor._prepare_workspace = MagicMock(return_value=self.work_dir)
        self.executor._acquire_container = MagicMock()
        self.executor._replenish_pool = MagicMock()
        self.executor.cw = MagicMock()
        self.executor.uploader = MagicMock()
        
        # Mock container
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (0, b"")
        mock_container.stats.return_value = {'memory_stats': {'usage': 100}}
        self.executor._acquire_container.return_value = mock_container
        
        # Prevent cleanup using patch
        with patch("shutil.rmtree") as mock_rmtree:
            # Execute
            result = self.executor.run(task)
            print(f"DEBUG: Run Result: {result.success}, {result.stderr}")
            
            # Verify call args for exec_run
            call_args = mock_container.exec_run.call_args
            env_vars = call_args[1]['environment']
            
            # Check logic results
            self.assertNotIn("PAYLOAD", env_vars, "PAYLOAD env var should be removed")
            self.assertIn("PAYLOAD_FILE", env_vars, "PAYLOAD_FILE env var should be present")
            self.assertEqual(env_vars["PAYLOAD_FILE"], "/workspace/req-123/payload.json")
            
            # Verify file creation
            payload_file = self.work_dir / "payload.json"
            self.assertTrue(payload_file.exists(), "Payload file should exist")

    def test_run_small_payload(self):
        """Test small payload uses env var"""
        small_payload = {"data": "small"}
        task = TaskMessage(
            request_id="req-123", function_id="func-1", runtime="python", s3_key="key", payload=small_payload
        )
        
        # Mocks
        self.executor._prepare_workspace = MagicMock(return_value=self.work_dir)
        self.executor._acquire_container = MagicMock(return_value=MagicMock())
        self.executor._replenish_pool = MagicMock()
        self.executor.cw = MagicMock()
        self.executor.uploader = MagicMock()
        
        mock_container = self.executor._acquire_container.return_value
        mock_container.exec_run.return_value = (0, b"")
        
        with patch("shutil.rmtree"):
            self.executor.run(task)
            
            call_args = mock_container.exec_run.call_args
            env_vars = call_args[1]['environment']
            
            self.assertIn("PAYLOAD", env_vars, "PAYLOAD env var should be present")
            self.assertNotIn("PAYLOAD_FILE", env_vars, "PAYLOAD_FILE env var should NOT be present")

if __name__ == '__main__':
    unittest.main()
