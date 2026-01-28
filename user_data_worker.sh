#!/bin/bash
# user_data_worker.sh - Fast Boot using Pre-baked AMI
# NOTE: All Python dependencies including urllib3 must be pre-installed in AMI
#       Private Subnet has NO internet access (no NAT Gateway)

# 0. Fetch Controller IP from SSM (uses VPC Endpoint)
echo "Waiting for Controller Private IP..."
CONTROLLER_IP=""
while [ -z "$CONTROLLER_IP" ] || [ "$CONTROLLER_IP" == "None" ]; do
  CONTROLLER_IP=$(aws ssm get-parameter --name "/faas/controller/private_ip" --query "Parameter.Value" --output text --region ${aws_region} || echo "")
  if [ -z "$CONTROLLER_IP" ]; then 
    sleep 5
  fi
done

# 1. Fix Git Permissions (AMI may have been baked as root)
chown -R ec2-user:ec2-user /home/ec2-user/faas-worker
git config --global --add safe.directory /home/ec2-user/faas-worker

# 2. Create .env file (Always overwrite - ensures latest Terraform values)
cat <<EOF > /home/ec2-user/faas-worker/.env
AWS_REGION=${aws_region}
SQS_URL=${sqs_url}
BUCKET_NAME=${bucket_name}
S3_USER_DATA_BUCKET=${user_data_bucket_name}
TABLE_NAME=${table_name}
REDIS_HOST=${redis_host}
REDIS_PORT=6379
DOCKER_WORK_DIR_ROOT=/home/ec2-user/faas_workspace
WARM_POOL_PYTHON_SIZE=${warm_pool_python_size}
AWS_ACCESS_KEY_ID=${aws_access_key}
AWS_SECRET_ACCESS_KEY=${aws_secret_key}
INFRA_API_KEY=test-api-key
AI_ENDPOINT=http://10.0.20.100:11434
CONTROLLER_URL=http://$CONTROLLER_IP:8080
EOF
chown ec2-user:ec2-user /home/ec2-user/faas-worker/.env

# 3. Code Update from S3 (if available, using VPC Endpoint)
echo "Checking for worker-latest.zip in S3://${bucket_name}..."
aws s3 cp s3://${bucket_name}/worker-latest.zip /home/ec2-user/worker.zip --region ${aws_region} || true
if [ -f /home/ec2-user/worker.zip ]; then
    echo "Found updated code. Unzipping..."
    # Ensure unzip is available (usually is)
    unzip -o /home/ec2-user/worker.zip -d /home/ec2-user/faas-worker/
    chown -R ec2-user:ec2-user /home/ec2-user/faas-worker/
    rm -f /home/ec2-user/worker.zip
fi

# 3. Start Agent
systemctl daemon-reload
systemctl enable --now faas-worker
