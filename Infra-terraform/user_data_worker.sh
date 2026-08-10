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

# 1. Fix application ownership (AMI may have been baked as root)
chown -R ec2-user:ec2-user /home/ec2-user/faas-worker

# 2. Create .env file (Always overwrite - ensures latest Terraform values)
cat <<EOF > /home/ec2-user/faas-worker/.env
AWS_REGION=${aws_region}
SQS_URL=${sqs_url}
S3_CODE_BUCKET=${bucket_name}
S3_USER_DATA_BUCKET=${user_data_bucket_name}
TABLE_NAME=${table_name}
REDIS_HOST=${redis_host}
REDIS_PORT=6379
DOCKER_WORK_DIR_ROOT=/home/ec2-user/faas_workspace
WARM_POOL_PYTHON_SIZE=${warm_pool_python_size}
INFRA_API_KEY=${infra_api_key}
AI_ENDPOINT=http://10.0.20.100:11434
CONTROLLER_URL=http://$CONTROLLER_IP:8080
EOF
chown ec2-user:ec2-user /home/ec2-user/faas-worker/.env

# 3. Start the immutable Worker code baked into the AMI.
systemctl daemon-reload
systemctl enable --now faas-worker
