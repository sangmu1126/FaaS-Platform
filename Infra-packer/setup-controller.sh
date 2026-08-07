#!/bin/bash
set -e

echo "[INFO] Starting Controller Setup..."

dnf update -y
dnf install -y git

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi

npm install -g pm2

install -d -o ec2-user -g ec2-user /home/ec2-user/faas-controller
cp -R /tmp/Infra-controller/. /home/ec2-user/faas-controller/
chown -R ec2-user:ec2-user /home/ec2-user/faas-controller
su - ec2-user -c "cd /home/ec2-user/faas-controller && npm ci --omit=dev"

rm -rf /var/lib/cloud/*
rm -rf /var/log/cloud-init*

echo "[INFO] Controller Setup Complete!"
