#!/bin/bash
set -euo pipefail

dnf install -y nodejs

install -d -m 0755 -o ec2-user -g ec2-user /opt/faas-load-test
echo '${stress_test_base64}' | base64 --decode > /opt/faas-load-test/stress_test.js
echo '{"type":"module"}' > /opt/faas-load-test/package.json
chown ec2-user:ec2-user /opt/faas-load-test/stress_test.js
chown ec2-user:ec2-user /opt/faas-load-test/package.json
chmod 0644 /opt/faas-load-test/stress_test.js
chmod 0644 /opt/faas-load-test/package.json

cat > /opt/faas-load-test/run-private.sh <<'SCRIPT'
#!/bin/bash
set -euo pipefail

AWS_REGION="$${AWS_REGION:-${aws_region}}"
export INFRA_API_KEY
INFRA_API_KEY=$(aws ssm get-parameter --name /faas/load-test/api-key --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text)
CONTROLLER_PRIVATE_IP=$(aws ssm get-parameter --name /faas/controller/private_ip --region "$AWS_REGION" --query Parameter.Value --output text)

: "$${TARGET_FUNCTION_ID:?TARGET_FUNCTION_ID is required}"

LOAD_TEST_PROTOCOL=http \
LOAD_TEST_TARGET_HOST="$CONTROLLER_PRIVATE_IP" \
LOAD_TEST_TARGET_PORT=8080 \
LOAD_TEST_PATH=/api/run \
node /opt/faas-load-test/stress_test.js
SCRIPT

chown ec2-user:ec2-user /opt/faas-load-test/run-private.sh
chmod 0755 /opt/faas-load-test/run-private.sh
