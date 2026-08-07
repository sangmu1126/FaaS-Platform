import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parents[2] / "Infra-worker"))

import sdk
from storage_adapter import StorageAdapter


class TestFaaSSDK(unittest.TestCase):
    def test_sdk_injection(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target = Path(temp_dir)
            StorageAdapter(s3_client=MagicMock(), redis_client=MagicMock()).inject_dependencies(target)
            self.assertEqual(
                (target / "sdk.py").read_text(),
                (Path(__file__).parents[2] / "Infra-worker" / "sdk.py").read_text(),
            )
            self.assertTrue((target / "ai_client.py").exists())

    def test_sdk_context(self):
        sdk._sdk._input_data = None
        env = {
            "JOB_ID": "job-123",
            "FUNCTION_ID": "func-abc",
            "MEMORY_MB": "2048",
            "LLM_MODEL": "llama3:8b",
            "PAYLOAD": '{"message":"hello"}',
        }
        with patch.dict(os.environ, env, clear=True):
            context = sdk.get_context()
            self.assertEqual(context["request_id"], "job-123")
            self.assertEqual(context["memory_mb"], "2048")
            self.assertEqual(sdk.get_input(), {"message": "hello"})


if __name__ == "__main__":
    unittest.main()
