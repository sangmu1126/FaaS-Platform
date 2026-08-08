import json
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import runner


class TestRunnerMetrics(unittest.TestCase):
    def test_records_only_handler_duration(self):
        user_module = ModuleType("main")
        user_module.handler = lambda event, context: {"ok": True}

        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(
                os.environ,
                {"OUTPUT_DIR": tmpdir, "PAYLOAD": '{"value": 1}'},
                clear=False,
            ), patch.dict(sys.modules, {"main": user_module}), redirect_stdout(io.StringIO()):
                runner.run_user_handler()

            metrics_path = Path(tmpdir) / runner.RUNTIME_METRICS_FILE
            metrics = json.loads(metrics_path.read_text())

        self.assertIsInstance(metrics["handlerDurationNs"], int)
        self.assertGreaterEqual(metrics["handlerDurationNs"], 0)


if __name__ == "__main__":
    unittest.main()
