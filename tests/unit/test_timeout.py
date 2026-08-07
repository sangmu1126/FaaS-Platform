import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).parents[2] / "Infra-worker"))

from executor import TaskExecutor


class TestTimeoutHandling(unittest.TestCase):
    def test_container_is_stopped_on_timeout(self):
        executor = TaskExecutor(
            {}, MagicMock(), MagicMock(), MagicMock(), MagicMock()
        )
        container = MagicMock()

        def hang(*args, **kwargs):
            time.sleep(0.2)
            return (0, b"")

        container.exec_run.side_effect = hang
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(TimeoutError):
                executor._execute_in_container(
                    container, ["sh", "-c", "echo test"], {}, 20, Path(temp_dir)
                )

        container.stop.assert_called_once_with(timeout=1)


if __name__ == "__main__":
    unittest.main()
