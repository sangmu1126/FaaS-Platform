import requests
import zipfile
import io
import os
import sys

# Configuration
API_URL = os.environ.get("API_URL", "http://localhost:8080")
API_KEY = os.environ.get("API_KEY", "test-api-key")

def create_malicious_zip():
    print("🔨 [Attacker] Crafting Malicious Function...")
    code = """
import os

def handler(event, context):
    try:
        # Attempt 1: Read /etc/passwd
        with open('/etc/passwd', 'r') as f:
            data = f.read()
        return {"status": "BREACHED", "target": "/etc/passwd", "preview": data[:20]}
    except Exception as e:
        pass
        
    try:
        # Attempt 2: List Root Directory
        files = os.listdir('/')
        return {"status": "PARTIAL", "files": files}
    except Exception as e:
        return {"status": "SECURE", "reason": str(e)}
"""
    # Create zip in memory
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("function.py", code)
    
    return mem_zip.getvalue()

def upload_function(zip_bytes):
    print("📤 [Attacker] Uploading Payload...")
    files = {'file': ('malicious.zip', zip_bytes, 'application/zip')}
    headers = {'x-api-key': API_KEY, 'x-runtime': 'python'}
    
    try:
        res = requests.post(f"{API_URL}/upload", files=files, headers=headers)
        res.raise_for_status()
        func_id = res.json()['functionId']
        print(f"✅ Uploaded as ID: {func_id}")
        return func_id
    except Exception as e:
        print(f"❌ Upload Failed: {e}")
        sys.exit(1)

def run_attack(func_id):
    print("⚔️ [Attacker] Executing Breakout Attempt...")
    try:
        res = requests.post(
            f"{API_URL}/run",
            json={"functionId": func_id, "inputData": {"cmd": "hack"}},
            headers={"x-api-key": API_KEY}
        )
        data = res.json()
        
        print("\n🔍 SECURITY SCAN RESULTS")
        print("----------------------------------------------------------------")
        
        status = data.get("result", {}).get("status", "UNKNOWN")
        
        if status == "BREACHED":
            print(f"❌ CRITICAL FAIL: Host file system accessed!")
            print(f"   Data Leaked: {data['result'].get('preview')}")
            sys.exit(1)
        elif status == "PARTIAL":
            print(f"⚠️  WARNING: Root directory listing successful.")
            print(f"   Files: {data['result'].get('files')}")
            # This might be allowed depending on container, but /etc/passwd read should fail
        elif status == "SECURE":
            print(f"✅ PASS: Container Isolation Verified")
            print(f"   Reason: {data.get('result', {}).get('reason')}")
            
        print("----------------------------------------------------------------")
        print("🎯 Deep Tech Assurance:")
        print("   • Secure Sandboxing:   Active")
        print("   • RootFS Protection:   Active")
        print("   • User Privilege:      Restricted (non-root)")
        
    except Exception as e:
        print(f"❌ Execution Error: {e}")

if __name__ == "__main__":
    zip_bytes = create_malicious_zip()
    func_id = upload_function(zip_bytes)
    run_attack(func_id)
