import unittest
import time
import shutil
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.modules["docker"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["structlog"] = MagicMock()

sys.path.insert(0, str(Path(__file__).parent.parent / "Infra-worker"))

from executor import TaskExecutor, TaskMessage

class TestTimeoutHandling(unittest.TestCase):
    def setUp(self):
        self.mock_config = {"DOCKER_WORK_DIR_ROOT": "/tmp/test_work_to", "AWS_REGION": "us-east-1"}
        self.executor = TaskExecutor(self.mock_config)
        self.executor.docker = MagicMock()
        self.executor.s3 = MagicMock()
        self.executor.pools = {"python": MagicMock()}
        self.executor.pool_locks = {"python": MagicMock()}
        
        self.work_dir = Path("/tmp/test_work_to/req-to")
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
        # Determine path to sdk.py (in Infra-worker) to avoid copy error
        self.executor._prepare_workspace = MagicMock(return_value=self.work_dir)

    def tearDown(self):
        if self.work_dir.exists():
            shutil.rmtree(self.work_dir)

    def test_graceful_shutdown(self):
        """Verify container.stop() is called on timeout"""
        task = TaskMessage(
            request_id="req-to", function_id="func-to", runtime="python", s3_key="key", timeout_ms=100 # 100ms timeout
        )
        
        # Mock container
        mock_container = MagicMock()
        self.executor._acquire_container = MagicMock(return_value=mock_container)
        self.executor._replenish_pool = MagicMock()
        self.executor.cw = MagicMock()
        self.executor.uploader = MagicMock()
        
        # Mock exec_run to hang FOREVER (simulate deadlock/long process)
        def hang(*args, **kwargs):
            time.sleep(2) # Sleep longer than timeout (0.1s)
            return (0, b"")
        mock_container.exec_run.side_effect = hang
        
        # Run
        try:
            self.executor.run(task)
        except TimeoutError:
            pass # Expected
        
        # Verify stop was called with timeout=3
        mock_container.stop.assert_called_with(timeout=3)
        # Verify kill was NOT called (unless stop failed, which we didn't simulate)
        mock_container.kill.assert_not_called()

if __name__ == '__main__':
    unittest.main()
