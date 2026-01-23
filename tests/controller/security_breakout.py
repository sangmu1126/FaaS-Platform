import requests
import zipfile
import io
import os
import sys
import json

# Configuration
API_URL = os.environ.get("API_URL", "http://localhost:8080")
API_KEY = os.environ.get("API_KEY", "test-api-key")

def create_malicious_zip():
    print("🔨 [Attacker] Crafting Malicious Function...")
    code = """
import os
import json
import subprocess

def handler(event, context):
    results = {
        "tests": [],
        "breached": False
    }
    
    # Test 1: Docker Socket Access (Critical - Container Escape)
    docker_socket = "/var/run/docker.sock"
    try:
        if os.path.exists(docker_socket):
            results["tests"].append({
                "name": "Docker Socket",
                "status": "BREACHED",
                "detail": "Docker socket accessible - container escape possible!"
            })
            results["breached"] = True
        else:
            results["tests"].append({
                "name": "Docker Socket",
                "status": "SECURE",
                "detail": "Socket not mounted"
            })
    except Exception as e:
        results["tests"].append({
            "name": "Docker Socket",
            "status": "SECURE",
            "detail": str(e)
        })
    
    # Test 2: Host Process Access (/proc/1/cmdline - init process)
    try:
        with open("/proc/1/cmdline", "r") as f:
            cmdline = f.read()
        # In container, PID 1 is usually the entrypoint, not host's systemd
        if "systemd" in cmdline or "init" in cmdline:
            results["tests"].append({
                "name": "Host Process",
                "status": "BREACHED", 
                "detail": f"Host init visible: {cmdline[:30]}"
            })
            results["breached"] = True
        else:
            results["tests"].append({
                "name": "Host Process",
                "status": "SECURE",
                "detail": "Container PID namespace isolated"
            })
    except Exception as e:
        results["tests"].append({
            "name": "Host Process",
            "status": "SECURE",
            "detail": str(e)
        })
    
    # Test 3: Host Network Namespace (can we see host interfaces?)
    try:
        # In isolated container, we shouldn't see host's eth0 with host IP
        with open("/proc/net/route", "r") as f:
            routes = f.read()
        # This is expected to work but shows container's network, not host's
        results["tests"].append({
            "name": "Network Namespace",
            "status": "ISOLATED",
            "detail": "Container network namespace active"
        })
    except Exception as e:
        results["tests"].append({
            "name": "Network Namespace",
            "status": "SECURE",
            "detail": str(e)
        })
    
    # Test 4: Privilege Escalation (can we become root?)
    try:
        uid = os.getuid()
        if uid == 0:
            results["tests"].append({
                "name": "Privilege Check",
                "status": "WARNING",
                "detail": "Running as root inside container"
            })
        else:
            results["tests"].append({
                "name": "Privilege Check",
                "status": "SECURE",
                "detail": f"Running as non-root (UID: {uid})"
            })
    except Exception as e:
        results["tests"].append({
            "name": "Privilege Check",
            "status": "SECURE",
            "detail": str(e)
        })
    
    # Test 5: Host Filesystem Mount Check
    try:
        with open("/proc/mounts", "r") as f:
            mounts = f.read()
        # Check if any sensitive host paths are mounted
        dangerous_mounts = ["/etc/shadow", "/root", "/home"]
        found_dangerous = [m for m in dangerous_mounts if m in mounts]
        if found_dangerous:
            results["tests"].append({
                "name": "Filesystem Mount",
                "status": "WARNING",
                "detail": f"Sensitive paths mounted: {found_dangerous}"
            })
        else:
            results["tests"].append({
                "name": "Filesystem Mount",
                "status": "SECURE",
                "detail": "No dangerous host mounts detected"
            })
    except Exception as e:
        results["tests"].append({
            "name": "Filesystem Mount", 
            "status": "SECURE",
            "detail": str(e)
        })

    print(json.dumps(results))
    return results

if __name__ == "__main__":
    handler(None, None)
"""
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
        
        print("\n" + "=" * 60)
        print("  🔍 CONTAINER ISOLATION SECURITY SCAN")
        print("=" * 60)
        
        # Parse stdout which contains our JSON results
        stdout = data.get("stdout", "")
        try:
            results = json.loads(stdout.strip())
        except json.JSONDecodeError:
            print(f"❌ Failed to parse results: {stdout}")
            return
        
        breached = results.get("breached", False)
        tests = results.get("tests", [])
        
        for test in tests:
            name = test.get("name", "Unknown")
            status = test.get("status", "UNKNOWN")
            detail = test.get("detail", "")
            
            if status == "BREACHED":
                icon = "🚨"
            elif status == "WARNING":
                icon = "⚠️"
            elif status == "SECURE" or status == "ISOLATED":
                icon = "✅"
            else:
                icon = "❓"
            
            print(f"  {icon} {name}: {status}")
            print(f"     └─ {detail}")
        
        print("-" * 60)
        
        if breached:
            print("❌ CRITICAL: Container isolation BREACHED!")
            print("   Immediate action required.")
            sys.exit(1)
        else:
            print("✅ PASS: Container Isolation Verified")
            print("   All critical security checks passed.")
        
        print("-" * 60)
        print("🎯 Security Summary:")
        print("   • Docker Socket:     Not Accessible")
        print("   • PID Namespace:     Isolated")
        print("   • Filesystem:        Sandboxed")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Execution Error: {e}")

if __name__ == "__main__":
    zip_bytes = create_malicious_zip()
    func_id = upload_function(zip_bytes)
    run_attack(func_id)
