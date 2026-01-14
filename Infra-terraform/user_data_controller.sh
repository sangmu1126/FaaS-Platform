#!/bin/bash
# user_data_controller.sh - Fast Boot using Pre-baked AMI

# 1. Associate Elastic IP (Critical for Workers)
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id ${eip_allocation_id} --region ${aws_region}

# 1.5. Publish Private IP to SSM for Workers
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
aws ssm put-parameter --name "/faas/controller/private_ip" --value "$PRIVATE_IP" --type "String" --overwrite --region ${aws_region}

# 2. Fix Git Permissions (AMI may have been baked as root)
chown -R ec2-user:ec2-user /home/ec2-user/faas-controller
git config --global --add safe.directory /home/ec2-user/faas-controller

# 3. Update .env file (Always overwrite - ensures latest Terraform values)
cat <<EOF > /home/ec2-user/faas-controller/.env
PORT=8080
AWS_REGION=${aws_region}
SQS_URL=${sqs_url}
BUCKET_NAME=${bucket_name}
TABLE_NAME=${table_name}
LOGS_TABLE_NAME=${logs_table_name}
REDIS_HOST=${redis_host}
REDIS_PORT=6379
INFRA_API_KEY=test-api-key
AWS_ACCESS_KEY_ID=${aws_access_key}
AWS_SECRET_ACCESS_KEY=${aws_secret_key}
EOF
chown ec2-user:ec2-user /home/ec2-user/faas-controller/.env

# 4. Restart Application to pick up new env vars
su - ec2-user -c "pm2 restart faas-controller"

# 5. CloudWatch Agent is already running (chkconfig on)
