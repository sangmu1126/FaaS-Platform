import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parents[2] / "Infra-worker"))

from executor import TaskExecutor
from models import TaskMessage


class TestPayloadLogic(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.container = MagicMock(id="a" * 64, is_warm=False)
        self.containers = MagicMock()
        self.containers.acquire_container.return_value = self.container
        self.containers.get_cgroup_cpu_usage.return_value = 0
        self.containers.get_network_stats.return_value = (0, 0)
        self.containers.get_disk_stats.return_value = (0, 0)
        self.containers.get_cgroup_memory_peak.return_value = 0
        self.storage = MagicMock()
        self.storage.prepare_workspace.return_value = self.workspace
        self.metrics = MagicMock()
        self.metrics.global_limit.acquire.return_value = True
        self.metrics.analyze_execution.return_value = (None, None, 128)
        self.executor = TaskExecutor(
            {}, self.containers, self.storage, self.metrics, MagicMock()
        )
        self.executor._execute_in_container = MagicMock(return_value=(0, b"ok"))
        self.executor._trigger_background_reporting = MagicMock()

    def tearDown(self):
        self.temp_dir.cleanup()

    def run_task(self, payload):
        task = TaskMessage(
            request_id="req-123",
            function_id="func-1",
            runtime="python",
            s3_key="key",
            payload=payload,
        )
        result = self.executor.run(task)
        env = self.executor._execute_in_container.call_args.args[2]
        return result, env

    def test_large_payload_uses_file(self):
        result, env = self.run_task({"data": "A" * (100 * 1024 + 10)})
        self.assertTrue(result.success)
        self.assertNotIn("PAYLOAD", env)
        self.assertEqual(env["PAYLOAD_FILE"], "/workspace/payload.json")
        self.assertTrue((self.workspace / "payload.json").exists())

    def test_small_payload_uses_environment(self):
        result, env = self.run_task({"message": "hello"})
        self.assertTrue(result.success)
        self.assertIn("PAYLOAD", env)
        self.assertNotIn("PAYLOAD_FILE", env)


if __name__ == "__main__":
    unittest.main()
