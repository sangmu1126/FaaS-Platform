#!/bin/bash
# verification_script.sh

API_URL="http://localhost:8080"
API_KEY="test_api_key_123"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Starting Verification..."

# 1. Upload Function (Simulated with dummy file)
echo "Creating dummy zip..."
echo "dummy" > dummy.zip

echo "1. Testing POST /upload..."
# We use -F for multipart/form-data. 
# Added description field as per improvement.
RESPONSE=$(curl -s -X POST "$API_URL/upload" \
  -H "x-api-key: $API_KEY" \
  -H "x-runtime: python" \
  -H "x-memory-mb: 128" \
  -F "file=@dummy.zip" \
  -F "description=Initial Description")

echo "Response: $RESPONSE"
FUNCTION_ID=$(echo $RESPONSE | jq -r '.functionId')

if [ "$FUNCTION_ID" == "null" ] || [ -z "$FUNCTION_ID" ]; then
    echo -e "${RED}[FAILED] Upload failed${NC}"
    exit 1
fi
echo -e "${GREEN}[PASS] Uploaded Function ID: $FUNCTION_ID${NC}"

# 2. Check Detail (GET)
echo "2. Testing GET /functions/$FUNCTION_ID..."
DETAIL=$(curl -s "$API_URL/functions/$FUNCTION_ID" -H "x-api-key: $API_KEY")
echo "Detail: $DETAIL"
DESC=$(echo $DETAIL | jq -r '.description')

if [ "$DESC" == "Initial Description" ]; then
    echo -e "${GREEN}[PASS] Initial Description matched${NC}"
else
    echo -e "${RED}[FAIL] Expected 'Initial Description', got '$DESC'${NC}"
fi

# 3. Update Description (PUT)
echo "3. Testing PUT /functions/$FUNCTION_ID (JSON Mode)..."
curl -s -X PUT "$API_URL/functions/$FUNCTION_ID" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated Description JSON"}' | jq .

# Verify update
DETAIL_UPDATED=$(curl -s "$API_URL/functions/$FUNCTION_ID" -H "x-api-key: $API_KEY")
DESC_UPDATED=$(echo $DETAIL_UPDATED | jq -r '.description')

if [ "$DESC_UPDATED" == "Updated Description JSON" ]; then
    echo -e "${GREEN}[PASS] PUT update via JSON matched${NC}"
else
    echo -e "${RED}[FAIL] Expected 'Updated Description JSON', got '$DESC_UPDATED'${NC}"
fi

# 4. List (GET)
echo "4. Testing GET /functions (List)..."
LIST=$(curl -s "$API_URL/functions" -H "x-api-key: $API_KEY")
LIST_DESC=$(echo $LIST | jq -r ".[] | select(.functionId == \"$FUNCTION_ID\") | .description")

if [ "$LIST_DESC" == "Updated Description JSON" ]; then
    echo -e "${GREEN}[PASS] List contains description${NC}"
else
    echo -e "${RED}[FAIL] List description mismatch. Got '$LIST_DESC'${NC}"
fi

echo -e "${GREEN}All Tests Completed${NC}"
rm dummy.zip
