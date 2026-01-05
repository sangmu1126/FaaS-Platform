#!/bin/bash
# user_data_worker.sh - Auto-provisioning for FaaS Worker

# 1. Update & Install Dependencies
yum update -y
yum install -y git python3-pip docker
# Install Development Tools for building some python packages (if needed)
yum groupinstall -y "Development Tools"

# 2. Start Docker
service docker start
usermod -a -G docker ec2-user
chkconfig docker on

# 3. Setup Application Directory
mkdir -p /home/ec2-user/faas-worker
chown ec2-user:ec2-user /home/ec2-user/faas-worker

# 4. Clone Code (As ec2-user)
# https://github.com/sangmu1126/Infra-worker.git
su - ec2-user -c "git clone https://github.com/sangmu1126/Infra-worker.git /home/ec2-user/faas-worker"

# 5. Install Python Dependencies
su - ec2-user -c "pip3 install -r /home/ec2-user/faas-worker/requirements.txt"
# If requirements.txt is missing, install manually (safety net)
su - ec2-user -c "pip3 install boto3 redis structlog python-dotenv prometheus_client"

# 6. Create .env file
# Terraform templatefile will replace placeholders
cat <<EOF > /home/ec2-user/faas-worker/.env
AWS_REGION=${aws_region}
SQS_URL=${sqs_url}
BUCKET_NAME=${bucket_name}
TABLE_NAME=${table_name}
REDIS_HOST=${redis_host}
REDIS_PORT=6379
DOCKER_WORK_DIR_ROOT=/home/ec2-user/faas_workspace
WARM_POOL_PYTHON_SIZE=${warm_pool_python_size}
AWS_ACCESS_KEY_ID=${aws_access_key}
AWS_SECRET_ACCESS_KEY=${aws_secret_key}
INFRA_API_KEY=test-api-key
AI_ENDPOINT=http://10.0.20.100:11434
CONTROLLER_URL=http://${controller_eip}:8080
EOF
chown ec2-user:ec2-user /home/ec2-user/faas-worker/.env

# 7. Start Agent (using nohup for background)
# Creating a systemd service is better, but keeps it simple for now.
# Or use PM2 for python too? No, simple nohup is standard for this scope.
cat <<EOF > /etc/systemd/system/faas-worker.service
[Unit]
Description=FaaS Worker Agent
After=network.target docker.service

[Service]
User=ec2-user
WorkingDirectory=/home/ec2-user/faas-worker
ExecStart=/usr/bin/python3 /home/ec2-user/faas-worker/agent.py
Restart=always
EnvironmentFile=/home/ec2-user/faas-worker/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable faas-worker
systemctl start faas-worker
