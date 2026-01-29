def handler(event, context):
    """Lightweight function for pure throughput testing."""
    return {"status": "ok", "message": "Hello from Load Test!", "test": True}
