import sys
import os
import json
import traceback
from time import perf_counter_ns

# Import the platform SDK
import sdk

RUNTIME_METRICS_FILE = ".faas_runtime_metrics.json"


def write_handler_duration(duration_ns):
    """Write platform-only timing data for the Worker to collect after execution."""
    output_dir = os.environ.get("OUTPUT_DIR", "/output")
    try:
        os.makedirs(output_dir, exist_ok=True)
        with open(os.path.join(output_dir, RUNTIME_METRICS_FILE), "w") as metrics_file:
            json.dump({"handlerDurationNs": duration_ns}, metrics_file)
    except OSError:
        # Metrics must never change the user function result.
        pass

def run_user_handler():
    """
    Main entry point for the FaaS Worker.
    This script is executed by the platform, not the user.
    It loads the user's code (main.py), executes the handler,
    and manages input/output via the SDK.
    """
    try:
        # 1. Import User Code (main.py)
        # The user's code is strictly expected to be in main.py
        try:
            import main as user_module
        except ImportError as e:
            print(f"Error: Could not import user code (main.py). {e}", file=sys.stderr)
            sys.exit(1)

        # 2. Get Input Context & Payload via SDK
        # The SDK handles reading from env vars or files automatically.
        context = sdk.get_context()
        event = sdk.get_input()

        # 3. Locate Handler Function
        # We default to 'handler' function in main.py
        # Future improvement: Make this configurable via HANDLER env var
        if hasattr(user_module, 'handler'):
            handler_func = user_module.handler
        elif hasattr(user_module, 'main'):
            handler_func = user_module.main
        else:
            print("Error: check your function entry point. 'handler(event, context)' or 'main(event, context)' not found in main.py", file=sys.stderr)
            sys.exit(1)

        # 4. Execute User Function
        # We pass event and context as arguments
        handler_started_ns = perf_counter_ns()
        try:
            result = handler_func(event, context)
        finally:
            write_handler_duration(perf_counter_ns() - handler_started_ns)

        # 5. Return Output via SDK
        # The SDK handles JSON formatting and standard output
        sdk.return_output(result)

    except Exception as e:
        # Catch-all for user code errors
        error_msg = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        # Print error to stderr for logs
        print(json.dumps(error_msg), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    run_user_handler()
