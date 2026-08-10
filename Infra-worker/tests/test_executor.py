import sys
from unittest.mock import MagicMock

# Mock dependencies before import
sys.modules["structlog"] = MagicMock()
sys.modules["docker"] = MagicMock()
sys.modules["boto3"] = MagicMock()
sys.modules["redis"] = MagicMock() 

import unittest
from pathlib import Path
import os
import tempfile
import io
import tarfile
import json
from collections import deque
from unittest.mock import patch

# Add parent directory to path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import local modules (which now utilize mocks for external libs)
# We need to make sure config is not broken if we mock it? 
# actually config.py doesn't depend on external heavily except imports.
# But container_manager imports docker.
# So mocking sys.modules["docker"] handles container_manager's import.

from executor import TaskExecutor, logger
from models import TaskMessage
from container_manager import ContainerManager
from storage_adapter import StorageAdapter
from metrics_collector import MetricsCollector
from uploader import OutputUploader
import config
import shutil

class TestTaskExecutor(unittest.TestCase):
    def setUp(self):
        self.mock_containers = MagicMock(spec=ContainerManager)
        self.mock_storage = MagicMock(spec=StorageAdapter)
        self.mock_metrics = MagicMock(spec=MetricsCollector)
        self.mock_uploader = MagicMock(spec=OutputUploader)
        
        # Setup Global Semaphore Mock
        self.mock_max_sema = MagicMock()
        self.mock_max_sema.acquire.return_value = True
        self.mock_metrics.global_limit = self.mock_max_sema

        self.executor = TaskExecutor(
            config_dict={},
            container_manager=self.mock_containers,
            storage_adapter=self.mock_storage,
            metrics_collector=self.mock_metrics,
            uploader=self.mock_uploader
        )
        
        # Set return values for stats to avoid TypeError in math ops
        self.mock_containers.get_cgroup_cpu_usage.return_value = 0
        self.mock_containers.get_network_stats.return_value = (0, 0)
        self.mock_containers.get_disk_stats.return_value = (0, 0)
        self.mock_containers.get_cgroup_memory_peak.return_value = 1024 * 1024 * 50 # 50MB
        self.mock_containers.get_process_ids.return_value = frozenset({1, 2})
        
        # Set return value for metrics analysis
        self.mock_metrics.analyze_execution.return_value = (None, None, None)
        
        # Init temp dir
        self.test_dir = tempfile.TemporaryDirectory()
        
        # Patch config.DOCKER_WORK_DIR_ROOT
        self.config_patcher = patch('config.DOCKER_WORK_DIR_ROOT', self.test_dir.name)
        self.config_patcher.start()

    def tearDown(self):
        self.config_patcher.stop()
        try:
             self.test_dir.cleanup()
        except: pass

    def test_run_success_cold_start(self):
        # Setup Task
        task = TaskMessage(
            request_id="req-1", function_id="func-1", runtime="python", s3_key="key"
        )
        
        # Setup Container Mock
        mock_container = MagicMock()
        mock_container.id = "container-1"
        mock_container.is_warm = False
        self.mock_containers.acquire_container.return_value = mock_container
        
        # Setup Storage Mock to return a real temporary path (subdir of test_dir)
        # We need a NEW unique dir for cold start return
        cold_start_dir = Path(self.test_dir.name) / "cold_req"
        cold_start_dir.mkdir()
        self.mock_storage.prepare_workspace.return_value = cold_start_dir
        
        # Setup Execution Mock
        # _execute_in_container is internal, but we can verify dependencies
        # Since we refactored, TaskExecutor orchestrates.
        
        # We need to patch the internal methods if we want to test run logic specifically
        # Or blindly trust mocks. 
        # But wait, TaskExecutor calls self.containers.copy_from_container, etc.
        
        # Let's mock the internal helper _execute_in_container to avoid threading issues in unit test
        # effectively just testing the orchestration flow
        with patch.object(self.executor, '_execute_in_container', return_value=(0, b"Success")):
            with patch.object(self.executor, '_read_llm_usage', return_value=10):
                result = self.executor.run(task)
        
        # Assertions
        if not result.success:
            print(f"LOGGER ERROR CALLS: {logger.error.call_args_list}")
        self.assertTrue(result.success, msg=f"Execution failed: {result.stderr} | {result.stdout}")
        self.assertEqual(result.stdout, "Success")
        
        # Verify Flow
        self.mock_metrics.global_limit.acquire.assert_called()
        self.mock_containers.acquire_container.assert_called_with("python", "func-1")
        self.mock_storage.prepare_workspace.assert_called() # Cold start
        self.mock_containers.copy_to_container.assert_called() # Inject code
        
        # Cleanup
        self.mock_containers.release_container.assert_called_with(mock_container, "func-1")

    def test_residual_process_discards_completed_container(self):
        task = TaskMessage(
            request_id="req-residual", function_id="func-1", runtime="python", s3_key="key"
        )
        mock_container = MagicMock()
        mock_container.id = "container-residual"
        mock_container.is_warm = False
        self.mock_containers.acquire_container.return_value = mock_container
        self.mock_containers.get_process_ids.side_effect = [
            frozenset({1, 2}),
            frozenset({1, 2, 99}),
        ]

        work_dir = Path(self.test_dir.name) / "residual_req"
        work_dir.mkdir()
        self.mock_storage.prepare_workspace.return_value = work_dir

        with patch.object(self.executor, '_execute_in_container', return_value=(0, b"Success")):
            with patch.object(self.executor, '_read_llm_usage', return_value=0):
                result = self.executor.run(task)

        self.assertTrue(result.success)
        self.mock_containers.discard_container.assert_called_once_with(mock_container)
        self.mock_containers.release_container.assert_not_called()

    def test_unavailable_process_snapshot_discards_completed_container(self):
        task = TaskMessage(
            request_id="req-unverified", function_id="func-1", runtime="python", s3_key="key"
        )
        mock_container = MagicMock()
        mock_container.id = "container-unverified"
        mock_container.is_warm = False
        self.mock_containers.acquire_container.return_value = mock_container
        self.mock_containers.get_process_ids.side_effect = [None, None]

        work_dir = Path(self.test_dir.name) / "unverified_req"
        work_dir.mkdir()
        self.mock_storage.prepare_workspace.return_value = work_dir

        with patch.object(self.executor, '_execute_in_container', return_value=(0, b"Success")):
            with patch.object(self.executor, '_read_llm_usage', return_value=0):
                result = self.executor.run(task)

        self.assertTrue(result.success)
        self.mock_containers.discard_container.assert_called_once_with(mock_container)
        self.mock_containers.release_container.assert_not_called()

    def test_run_success_warm_start(self):
        # Setup Task
        task = TaskMessage(
            request_id="req-2", function_id="func-1", runtime="python", s3_key="key"
        )
        
        # Setup Container Mock (Warm)
        mock_container = MagicMock()
        mock_container.id = "container-1"
        mock_container.is_warm = True
        self.mock_containers.acquire_container.return_value = mock_container
        
        with patch.object(self.executor, '_execute_in_container', return_value=(0, b"Warm Success")):
            with patch.object(self.executor, '_read_llm_usage', return_value=0):
                 result = self.executor.run(task)

        # Assertions
        if not result.success:
            print(f"LOGGER ERROR CALLS: {logger.error.call_args_list}")
        self.assertTrue(result.success, msg=f"Execution failed: {result.stderr} | {result.stdout}")
        
        # Verify Flow
        self.mock_storage.prepare_workspace.assert_not_called() # Warm start skips download
        # User code remains in the warm container, but trusted system files are
        # injected and verified on every execution.
        self.mock_containers.copy_to_container.assert_called_once()
        self.mock_containers.verify_files_readable.assert_called_once()

    def test_failed_container_setup_discards_container(self):
        task = TaskMessage(
            request_id="req-3", function_id="func-1", runtime="python", s3_key="key"
        )
        mock_container = MagicMock()
        mock_container.id = "container-1"
        mock_container.is_warm = False
        self.mock_containers.acquire_container.return_value = mock_container

        cold_start_dir = Path(self.test_dir.name) / "failed_req"
        cold_start_dir.mkdir()
        self.mock_storage.prepare_workspace.return_value = cold_start_dir
        self.mock_containers.copy_to_container.side_effect = RuntimeError("archive rejected")

        result = self.executor.run(task)

        self.assertFalse(result.success)
        self.assertIn("archive rejected", result.stderr)
        self.mock_containers.discard_container.assert_called_once_with(mock_container)
        self.mock_containers.release_container.assert_not_called()

    def test_reads_and_removes_handler_duration_metadata(self):
        output_dir = Path(self.test_dir.name) / "metrics_output"
        container_output_dir = output_dir / "output"
        container_output_dir.mkdir(parents=True)
        metrics_file = container_output_dir / ".faas_runtime_metrics.json"
        metrics_file.write_text(json.dumps({"handlerDurationNs": 12_345_678}))

        duration_ms = self.executor._read_handler_duration(output_dir)

        self.assertEqual(duration_ms, 12.346)
        self.assertFalse(metrics_file.exists())

    def test_invalid_handler_duration_metadata_is_removed(self):
        output_dir = Path(self.test_dir.name) / "invalid_metrics_output"
        output_dir.mkdir()
        metrics_file = output_dir / ".faas_runtime_metrics.json"
        metrics_file.write_text("not-json")

        self.assertIsNone(self.executor._read_handler_duration(output_dir))
        self.assertFalse(metrics_file.exists())


class TestContainerArchiveCopy(unittest.TestCase):
    def setUp(self):
        self.manager = ContainerManager.__new__(ContainerManager)
        self.container = MagicMock()
        self.container.put_archive.return_value = True
        self.container.exec_run.return_value = MagicMock(exit_code=0, output=b"")

    def test_copy_uses_flat_archive_and_checks_docker_result(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir)
            (source / "main.py").write_text("def handler(event, context): return event")
            (source / "runner.py").write_text("print('runner')")

            self.manager.copy_to_container(self.container, source, "/workspace")

        target, payload = self.container.put_archive.call_args.args
        self.assertEqual(target, "/tmp/faas-archive-staging")
        self.assertIsInstance(payload, bytes)
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            self.assertEqual(sorted(archive.getnames()), ["main.py", "runner.py"])

    def test_process_snapshot_returns_container_pids(self):
        self.container.top.return_value = {
            "Titles": ["PID"],
            "Processes": [["1"], ["42"], ["105"]],
        }

        self.assertEqual(
            self.manager.get_process_ids(self.container),
            frozenset({1, 42, 105})
        )
        self.container.top.assert_called_once_with(ps_args="-eo pid")

    def test_process_snapshot_fails_closed(self):
        self.container.top.side_effect = RuntimeError("Docker API unavailable")

        self.assertIsNone(self.manager.get_process_ids(self.container))

    def test_warm_container_uses_docker_init(self):
        self.manager.docker = MagicMock()
        self.manager.pools = {
            "python": deque(),
            "nodejs": deque(),
            "cpp": deque(),
            "go": deque(),
        }
        self.manager.pid_cache = {}
        created = MagicMock()
        created.id = "container-with-init"
        created.attrs = {"State": {"Pid": 1234}}
        self.manager.docker.containers.run.return_value = created

        container_id = self.manager._create_warm_container("python")

        self.assertEqual(container_id, "container-with-init")
        self.assertTrue(self.manager.docker.containers.run.call_args.kwargs["init"])

    def test_copy_raises_when_docker_rejects_archive(self):
        self.container.put_archive.return_value = False
        with tempfile.TemporaryDirectory() as tmpdir:
            source = Path(tmpdir)
            (source / "main.py").write_text("pass")
            with self.assertRaisesRegex(RuntimeError, "rejected archive"):
                self.manager.copy_to_container(self.container, source, "/workspace")

    def test_copy_from_container_stages_tmpfs_output(self):
        archive_stream = io.BytesIO()
        with tarfile.open(fileobj=archive_stream, mode="w") as archive:
            payload = b'{"handlerDurationNs": 150000000}'
            info = tarfile.TarInfo("output/.faas_runtime_metrics.json")
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
        self.container.get_archive.return_value = ([archive_stream.getvalue()], {})

        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir)
            self.manager.copy_from_container(self.container, "/output", target)

            metrics_file = target / "output" / ".faas_runtime_metrics.json"
            self.assertTrue(metrics_file.exists())

        self.container.get_archive.assert_called_once_with("/tmp/faas-output-staging/output")
        copy_call = next(
            call for call in self.container.exec_run.call_args_list
            if call.kwargs.get("user") == "65534:65534"
        )
        self.assertIn("cp -R /output/.", copy_call.args[0][2])

if __name__ == '__main__':
    unittest.main()
