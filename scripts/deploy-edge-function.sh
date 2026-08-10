#!/bin/bash
# Deploy the notify-sale Edge Function to Supabase production
# 
# Usage: SUPABASE_ACCESS_TOKEN=your_token ./deploy-edge-function.sh
#
# Get your token from: https://supabase.com/dashboard/account/tokens

set -euo pipefail

PROJECT_REF="qexafenusvjkyzfhtpda"
FUNCTION_NAME="notify-sale"
FUNCTION_FILE="supabase/functions/notify-sale/index.ts"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN not set."
  echo "Get your token from: https://supabase.com/dashboard/account/tokens"
  echo "Then run: SUPABASE_ACCESS_TOKEN=your_token $0"
  exit 1
fi

echo "Deploying $FUNCTION_NAME to Supabase project $PROJECT_REF..."

# Use Supabase CLI
export SUPABASE_ACCESS_TOKEN
supabase functions deploy "$FUNCTION_NAME" \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt

echo ""
echo "Deployment complete! Verifying..."

# Verify the deployed function
sleep 3

echo ""
echo "Testing OPTIONS preflight..."
curl -s -X OPTIONS "https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}" \
  -H "Origin: https://track-tracker-app.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,apikey" \
  -D - -o /dev/null 2>&1 | grep -i "access-control"

echo ""
echo "Done!"
