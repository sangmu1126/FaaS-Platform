import unittest
import socket
import shutil
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.modules["docker"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["structlog"] = MagicMock()

sys.path.insert(0, str(Path(__file__).parent.parent / "Infra-worker"))

from executor import TaskExecutor, TaskMessage

class TestMetadata(unittest.TestCase):
    def setUp(self):
        self.mock_config = {"DOCKER_WORK_DIR_ROOT": "/tmp/test_work_meta", "AWS_REGION": "us-east-1"}
        self.executor = TaskExecutor(self.mock_config)
        self.executor.docker = MagicMock()
        self.executor.s3 = MagicMock()
        
        self.work_dir = Path("/tmp/test_work_meta/req-meta")
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.executor._prepare_workspace = MagicMock(return_value=self.work_dir)

    def tearDown(self):
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir)

    def test_worker_id_inclusion(self):
        """Verify worker_id is included in ExecutionResult"""
        task = TaskMessage(
            request_id="req-meta", function_id="func-meta", runtime="python", s3_key="key"
        )
        
        # Mock successful execution
        mock_container = MagicMock()
        mock_container.exec_run.return_value = (0, b"success")
        mock_container.stats.return_value = {'memory_stats': {'usage': 100}}
        
        self.executor._acquire_container = MagicMock(return_value=mock_container)
        self.executor._replenish_pool = MagicMock()
        self.executor.cw = MagicMock()
        self.executor.uploader = MagicMock()
        self.executor.uploader.upload_outputs.return_value = [] # Mock file upload return
        
        # Run
        result = self.executor.run(task)
        
        # Verify worker_id matches hostname
        expected_hostname = socket.gethostname()
        self.assertEqual(result.worker_id, expected_hostname, "Worker ID must match hostname")
        
        # Verify to_dict includes it
        result_dict = result.to_dict()
        self.assertEqual(result_dict["workerId"], expected_hostname, "workerId field must be present in dict")

if __name__ == '__main__':
    unittest.main()
