#!/bin/bash
# user_data_controller.sh - Git-based Deployment (No Pre-baked AMI required)
# This script clones the latest code from GitHub on every new instance launch

set -e  # Exit on error

GITHUB_REPO="https://github.com/sangmu1126/Infra-controller.git"
APP_DIR="/home/ec2-user/faas-controller"

# 1. Associate Elastic IP (Critical for external access)
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id ${eip_allocation_id} --region ${aws_region}

# 2. Publish Private IP to SSM for Workers
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
aws ssm put-parameter --name "/faas/controller/private_ip" --value "$PRIVATE_IP" --type "String" --overwrite --region ${aws_region}

# 3. Install Git if not present
if ! command -v git &> /dev/null; then
    dnf install -y git
fi

# 4. Install Node.js 18 LTS if not present
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf install -y nodejs
fi

# 5. Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# 6. Clone or Update Repository
if [ -d "$APP_DIR" ]; then
    # Directory exists - pull latest
    cd $APP_DIR
    git config --global --add safe.directory $APP_DIR
    git pull origin main || git pull origin master || true
else
    # Fresh clone
    git clone $GITHUB_REPO $APP_DIR
fi

# 5. Set ownership
chown -R ec2-user:ec2-user $APP_DIR

# 6. Install dependencies
cd $APP_DIR
su - ec2-user -c "cd $APP_DIR && npm install"

# 7. Create .env file with Terraform values
cat <<EOF > $APP_DIR/.env
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
chown ec2-user:ec2-user $APP_DIR/.env

# 8. Start or Restart Application with PM2
if su - ec2-user -c "pm2 list | grep -q faas-controller"; then
    su - ec2-user -c "pm2 restart faas-controller"
else
    su - ec2-user -c "cd $APP_DIR && pm2 start controller.js --name faas-controller"
    su - ec2-user -c "pm2 save"
fi

# 9. CloudWatch Agent (if installed)
# Already configured via AMI or separate setup
