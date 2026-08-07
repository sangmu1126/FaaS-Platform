import socket
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parents[2] / "Infra-worker"))

from executor import TaskExecutor
from models import TaskMessage


class TestMetadata(unittest.TestCase):
    def test_worker_id_inclusion(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            container = MagicMock(id="a" * 64, is_warm=False)
            containers = MagicMock()
            containers.acquire_container.return_value = container
            containers.get_cgroup_cpu_usage.return_value = 0
            containers.get_network_stats.return_value = (0, 0)
            containers.get_disk_stats.return_value = (0, 0)
            containers.get_cgroup_memory_peak.return_value = 0
            storage = MagicMock()
            storage.prepare_workspace.return_value = Path(temp_dir)
            metrics = MagicMock()
            metrics.global_limit.acquire.return_value = True
            metrics.analyze_execution.return_value = (None, None, 128)
            executor = TaskExecutor({}, containers, storage, metrics, MagicMock())
            executor._execute_in_container = MagicMock(return_value=(0, b"success"))
            executor._trigger_background_reporting = MagicMock()

            result = executor.run(TaskMessage("req", "func", "python", "key"))

            self.assertEqual(result.worker_id, socket.gethostname())
            self.assertEqual(result.to_dict()["workerId"], socket.gethostname())


if __name__ == "__main__":
    unittest.main()
