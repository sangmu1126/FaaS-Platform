#!/bin/bash
set -e

echo "[INFO] Starting Worker Setup..."

# 1. Update OS
yum update -y

# 2. Install Dependencies
yum install -y python3 python3-pip git docker

# 3. Start Docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# 4. Install Python Packages (Common)
pip3 install boto3 requests redis psutil flask

# 5. Create Workspace Directory
mkdir -p /workspace
chown -R ec2-user:ec2-user /workspace

echo "[INFO] Worker Setup Complete!"
