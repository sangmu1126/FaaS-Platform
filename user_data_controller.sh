#!/bin/bash
# user_data_controller.sh - Fast Boot using Pre-baked AMI

# 1. Associate Elastic IP (Critical for Workers)
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id ${eip_allocation_id} --region ${aws_region}

# 2. Update .env file (Injecting dynamic variables)
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

# 3. Restart Application to pick up new env vars
# Since CloudWatch Agent and App are already installed/running in AMI
# We just need to restart the app.
su - ec2-user -c "pm2 restart faas-controller"

# 4. CloudWatch Agent is already running (chkconfig on)

