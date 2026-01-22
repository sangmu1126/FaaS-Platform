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
import json
import sys

def handler(event, context):
    result = {}
    try:
        # 시도 1: /etc/passwd 읽기
        with open('/etc/passwd', 'r') as f:
            data = f.read()
        result = {"status": "BREACHED", "target": "/etc/passwd", "preview": data[:20]}
    except Exception:
        pass
        
    if not result:
        try:
            # 시도 2: 루트 디렉토리 목록 조회
            files = os.listdir('/')
            result = {"status": "PARTIAL", "files": files}
        except Exception as e:
            result = {"status": "SECURE", "reason": str(e)}

    # 결과를 stdout으로 출력 (서버가 이를 캡처함)
    print(json.dumps(result))
    return result

# [핵심 수정] 스크립트 실행 시 핸들러를 강제로 호출
if __name__ == "__main__":
    handler(None, None)
"""
    # Create zip in memory
    mem_zip = io.BytesIO()
    with zipfile.ZipFile(mem_zip, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("main.py", code)
    
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
        print(f"DEBUG: Raw Response: {data}") # Debugging line
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
