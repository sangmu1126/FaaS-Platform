#!/bin/bash
# user_data_worker.sh - Fast Boot using Pre-baked AMI

# 1. Create .env file
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

# 2. Start Agent
systemctl daemon-reload
systemctl enable --now faas-worker
