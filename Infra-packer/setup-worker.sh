#!/bin/bash
set -e

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

# Worker runs without internet access, so runtime images must be baked in.
docker pull python:3.9
docker pull node:18-alpine
docker pull gcc:latest
docker pull golang:1.19-alpine

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
