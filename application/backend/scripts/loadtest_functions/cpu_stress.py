import random

def handler(event, context):
    """CPU-intensive function for stress testing (Matrix Multiplication)."""
    size = event.get('size', 50)  # 50x50 matrix by default
    
    # Generate random matrices
    a = [[random.random() for _ in range(size)] for _ in range(size)]
    b = [[random.random() for _ in range(size)] for _ in range(size)]
    
    # Matrix multiplication (O(n^3) - CPU intensive)
    result = [[sum(a[i][k] * b[k][j] for k in range(size)) for j in range(size)] for i in range(size)]
    
    return {
        "status": "done",
        "matrix_size": size,
        "checksum": sum(result[0]),  # Simple validation
        "test": True
    }
