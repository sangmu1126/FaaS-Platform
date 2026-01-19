import time

def handler(event, context):
    start = time.time()
    
    # CPU Intensive Task
    n = 25
    if n <= 1:
        return n
    else:
        a, b = 0, 1
        for _ in range(2, n + 1):
            a, b = b, a + b
            
    # Sleep to simulate IO wait / Processing time
    time.sleep(0.5) 
    
    duration = time.time() - start
    return {
        "statusCode": 200,
        "body": f"Processed Fibonacci({n}) in {duration:.4f}s"
    }

if __name__ == "__main__":
    result = handler({}, {})
    print(result["body"])
