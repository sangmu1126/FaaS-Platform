#!/bin/bash
set -euo pipefail

echo "[INFO] Starting Worker Setup..."

# 1. Update OS
dnf update -y

# 2. Install Dependencies
dnf install -y python3 python3-pip git docker unzip

# 3. Start Docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# 4. Install Worker Code and Python Packages
install -d -o ec2-user -g ec2-user /home/ec2-user/faas-worker
cp -R /tmp/Infra-worker/. /home/ec2-user/faas-worker/
python3 -m venv /home/ec2-user/faas-worker/.venv
/home/ec2-user/faas-worker/.venv/bin/python -m pip install --upgrade pip
/home/ec2-user/faas-worker/.venv/bin/python -m pip install -r /home/ec2-user/faas-worker/requirements.txt
chown -R ec2-user:ec2-user /home/ec2-user/faas-worker

# Fail the AMI build before image creation if the baked Worker source is not
# importable or its unit-level execution invariants are broken.
/home/ec2-user/faas-worker/.venv/bin/python -m compileall -q /home/ec2-user/faas-worker
/home/ec2-user/faas-worker/.venv/bin/python -m unittest discover \
  -s /home/ec2-user/faas-worker/tests -p 'test_*.py'

# Worker runs without internet access, so immutable runtime images must be
# pulled and tagged with stable local names while the AMI is built.
source /home/ec2-user/faas-worker/runtime-images.env
for runtime in PYTHON NODEJS CPP GO; do
    source_var="${runtime}_RUNTIME_SOURCE"
    image_var="${runtime}_RUNTIME_IMAGE"
    source_image="${!source_var}"
    local_image="${!image_var}"
    docker pull "$source_image"
    docker tag "$source_image" "$local_image"
    docker image inspect "$local_image" >/dev/null
    docker run --rm --read-only --user 65534:65534 \
      --tmpfs /tmp:rw,nosuid,nodev,exec,size=16m,mode=1777 \
      "$local_image" sh -c 'command -v tar >/dev/null && command -v tail >/dev/null'
done

# Development-only files are not part of the runtime artifact.
rm -rf \
  /home/ec2-user/faas-worker/__pycache__ \
  /home/ec2-user/faas-worker/tests \
  /home/ec2-user/faas-worker/docker \
  /home/ec2-user/faas-worker/trigger_test.py

install -m 0644 /home/ec2-user/faas-worker/infra-worker.service /etc/systemd/system/faas-worker.service
systemctl daemon-reload

# 5. Create Workspace Directory
mkdir -p /workspace
chown -R ec2-user:ec2-user /workspace

echo "[INFO] Worker Setup Complete!"

# 6. Cleanup Cloud-Init (CRITICAL for Pre-baked AMI)
# This allows User Data to run again on new instances launched from this AMI
echo "[INFO] Cleaning up cloud-init state..."
rm -rf /var/lib/cloud/*
rm -rf /var/log/cloud-init*
dnf clean all
rm -rf /var/cache/dnf /root/.cache/pip
