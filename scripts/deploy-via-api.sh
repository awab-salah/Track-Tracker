#!/bin/bash
# Deploy notify-sale Edge Function to Supabase via Management API
#
# Usage: SUPABASE_ACCESS_TOKEN=your_token ./deploy-via-api.sh
#
# Get your token from: https://supabase.com/dashboard/account/tokens
# (This is a PERSONAL ACCESS TOKEN, not the anon key or service role key)

set -euo pipefail

PROJECT_REF="qexafenusvjkyzfhtpda"
FUNCTION_NAME="notify-sale"
API_URL="https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_NAME}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN environment variable not set."
  echo ""
  echo "Get your personal access token from:"
  echo "  https://supabase.com/dashboard/account/tokens"
  echo ""
  echo "Then run:"
  echo "  SUPABASE_ACCESS_TOKEN=sbp_xxxxx ./deploy-via-api.sh"
  exit 1
fi

echo "Deploying ${FUNCTION_NAME} to Supabase project ${PROJECT_REF}..."
echo "API URL: ${API_URL}"
echo ""

RESPONSE=$(curl -s -w "\n---HTTP_STATUS:%{http_code}---" \
  -X PUT "${API_URL}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @/home/z/my-project/scripts/deploy-payload.json \
  2>&1)

HTTP_STATUS=$(echo "$RESPONSE" | grep -oP '---HTTP_STATUS:(\d+)---' | grep -oP '\d+')
BODY=$(echo "$RESPONSE" | sed '/---HTTP_STATUS:/d')

echo "HTTP Status: ${HTTP_STATUS}"
echo "Response: ${BODY}"
echo ""

if [ "${HTTP_STATUS}" = "200" ]; then
  echo "✅ Deployment successful!"
  echo ""
  echo "Waiting 5 seconds for function to propagate..."
  sleep 5
  echo ""
  echo "=== Verification: OPTIONS preflight ==="
  curl -s -X OPTIONS "https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}" \
    -H "Origin: https://track-tracker-app.vercel.app" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization,content-type,apikey" \
    -D - -o /dev/null 2>&1 | grep -i "access-control"
else
  echo "❌ Deployment failed with HTTP ${HTTP_STATUS}"
  echo "Check the response above for error details."
fi
