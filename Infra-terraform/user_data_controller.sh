#!/bin/bash
# user_data_controller.sh - Git-based Deployment (No Pre-baked AMI required)
# This script clones the latest code from GitHub on every new instance launch

set -e  # Exit on error

GITHUB_REPO="https://github.com/sangmu1126/Infra-controller.git"
APP_DIR="/home/ec2-user/faas-controller"
BFF_DIR="/home/ec2-user/faas-bff"
BFF_ARCHIVE="/tmp/faas-bff.zip"

# 1. Associate Elastic IP (Critical for external access)
IMDS_TOKEN=$(curl -fsS -X PUT \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
    http://169.254.169.254/latest/api/token)
INSTANCE_ID=$(curl -fsS \
    -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    http://169.254.169.254/latest/meta-data/instance-id)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id ${eip_allocation_id} --region ${aws_region}

# 2. Publish Private IP to SSM for Workers
PRIVATE_IP=$(curl -fsS \
    -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    http://169.254.169.254/latest/meta-data/local-ipv4)
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

# 6. Clone only when the AMI does not already contain the application.
if [ ! -d "$APP_DIR" ]; then
    # Fresh clone
    git clone $GITHUB_REPO $APP_DIR
elif [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" pull --ff-only || true
fi

# 5. Set ownership
chown -R ec2-user:ec2-user $APP_DIR

# 6. Install dependencies
cd $APP_DIR
su - ec2-user -c "cd $APP_DIR && npm ci --omit=dev"

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
INFRA_API_KEY=${infra_api_key}
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

# 10. Deploy the dashboard BFF package uploaded by scripts/deploy.sh.
# Package content hash: ${bff_package_hash}
if ! command -v unzip &> /dev/null; then
    dnf install -y unzip
fi

aws s3 cp "s3://${bff_bucket_name}/${bff_object_key}" "$BFF_ARCHIVE" --region ${aws_region}
mkdir -p "$BFF_DIR"
find "$BFF_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
unzip -q "$BFF_ARCHIVE" -d "$BFF_DIR"
chown -R ec2-user:ec2-user "$BFF_DIR"

cat <<EOF > "$BFF_DIR/.env"
PORT=3001
AWS_REGION=${aws_region}
AWS_CONTROLLER_URL=http://127.0.0.1:8080
INFRA_API_KEY=${infra_api_key}
AUTH_TOKEN_SECRET=${bff_auth_secret}
AUTH_USERS_TABLE=${bff_users_table}
EOF
chown ec2-user:ec2-user "$BFF_DIR/.env"

if su - ec2-user -c "pm2 list | grep -q faas-bff"; then
    su - ec2-user -c "cd $BFF_DIR && pm2 restart faas-bff --update-env"
else
    su - ec2-user -c "cd $BFF_DIR && pm2 start src/server.js --name faas-bff"
    su - ec2-user -c "pm2 save"
fi
