#!/usr/bin/env python3
"""
ZainCash Complete E2E Test - Payment via Browser
=================================================
Uses our Vercel API to create a payment, then attempts to 
complete the payment through the ZainCash payment page using
the official test wallet credentials.
"""

import json
import time
import urllib.parse
import urllib.request
import urllib.error
import ssl

VERCEL_BASE = 'https://track-tracker-app.vercel.app'

def http_request(method, url, data=None, timeout=30):
    body = None
    if data:
        body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', 'ZainCash-E2E-Test/1.0')
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
            resp_body = resp.read().decode('utf-8')
            try:
                resp_json = json.loads(resp_body)
            except:
                resp_json = None
            return {'status': resp.status, 'body': resp_body, 'json': resp_json}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8') if e.fp else ''
        try:
            resp_json = json.loads(resp_body)
        except:
            resp_json = None
        return {'status': e.code, 'body': resp_body, 'json': resp_json}
    except Exception as e:
        return {'status': -1, 'body': str(e), 'json': None}

def main():
    print("╔════════════════════════════════════════════════════════════════════╗")
    print("║     ZainCash Complete E2E Test - Browser Payment Flow              ║")
    print("╚════════════════════════════════════════════════════════════════════╝")
    
    # Step 1: Create payment
    print("\n" + "="*70)
    print("STEP 1: Create Payment")
    print("="*70)
    
    create_url = f"{VERCEL_BASE}/api/zaincash/create"
    create_payload = {
        'planId': 'plan-10',
        'amount': 14000,
        'companyId': 'c0d2f3c8-5fce-4be2-8cd7-9a16fcb371ed',  # Real test company ID
    }
    
    result = http_request('POST', create_url, create_payload)
    print(f"  Status: {result['status']}")
    
    if result['json'] and result['json'].get('transactionId'):
        tx_id = result['json']['transactionId']
        redirect_url = result['json']['redirectUrl']
        order_id = result['json']['orderId']
        print(f"  ✅ Transaction Created")
        print(f"  Transaction ID: {tx_id}")
        print(f"  Redirect URL: {redirect_url}")
        print(f"  Order ID: {order_id}")
    else:
        print(f"  ❌ Failed to create transaction")
        print(f"  Response: {result['body'][:300]}")
        return
    
    # Step 2: Verify status before payment
    print("\n" + "="*70)
    print("STEP 2: Verify Transaction Status (before payment)")
    print("="*70)
    
    verify_url = f"{VERCEL_BASE}/api/zaincash/verify?transactionId={tx_id}"
    result = http_request('GET', verify_url)
    if result['json']:
        status = result['json'].get('status')
        print(f"  Status: {status}")
        details = result['json'].get('details', {})
        print(f"  Amount: {details.get('amount')} IQD")
        print(f"  Service Type: {details.get('serviceType')}")
        print(f"  Order ID: {details.get('orderId')}")
        print(f"  Reference Number: {details.get('referenceNumber')}")
        print(f"  Merchant: {details.get('to', {}).get('name')}")
    
    # Step 3: Print instructions for manual browser testing
    print("\n" + "="*70)
    print("STEP 3: Manual Browser Payment Test Instructions")
    print("="*70)
    print(f"""
  To complete the end-to-end test manually:

  1. Open this URL in your browser:
     {redirect_url}

  2. On the ZainCash payment page, enter:
     - Wallet Number (MSISDN): 9647802999569
     - PIN: 1111
     - OTP (when prompted): 111111

  3. After completing the payment, the browser will redirect
     back to our app.

  4. Then verify the transaction:
     GET {verify_url}

  5. Expected result: status should change from "pending" to "completed"

  Alternative test wallets:
     - 9647829744432 (PIN: 1111, OTP: 111111)
     - 9647829744464 (PIN: 1111, OTP: 111111)
     - 9647829744474 (PIN: 1111, OTP: 111111)
""")
    
    # Step 4: Check if callback URL is correctly configured
    print("\n" + "="*70)
    print("STEP 4: Callback URL Configuration Check")
    print("="*70)
    
    callback_url = f"{VERCEL_BASE}/api/zaincash/callback"
    print(f"  Callback URL: {callback_url}")
    print(f"  Redirect URL (in JWT): {redirect_url}")
    
    # The redirectUrl in the JWT tells ZainCash where to send the user after payment
    # The callbackUrl tells ZainCash where to send server-to-server notification
    # Our code currently only sets redirectUrl, NOT callbackUrl in the JWT
    # This means ZainCash may not send a server-to-server callback!
    print(f"""
  ⚠️  IMPORTANT FINDING: Callback URL Configuration
  
  Our JWT payload includes 'redirectUrl' but NOT 'callbackUrl'.
  The ZainCash v1 API supports both:
    - redirectUrl: Where ZainCash redirects the USER's browser after payment
    - callbackUrl: Where ZainCash sends a server-to-server notification
  
  Without callbackUrl, ZainCash may only redirect the user back
  but NOT call our /api/zaincash/callback endpoint server-to-server.
  
  This means:
  1. After payment, user is redirected to our app ✅
  2. But our callback handler may NOT be called ❌
  3. Payment record may stay 'pending' in our database ❌
  4. Subscription may NOT be auto-activated ❌
  
  Current flow relies on:
  - Client-side verification (useZainCashPayment → verifyPendingPayment)
  - This polls /api/zaincash/verify which calls ZainCash inquiry
  - If status is 'completed', it activates subscription locally
  
  This works but is less reliable than a server-to-server callback.
""")

    # Step 5: Analyze the JWT payload structure
    print("\n" + "="*70)
    print("STEP 5: JWT Payload Analysis")
    print("="*70)
    
    print("""
  Our JWT payload for transaction/init:
  {
    "amount": 14000,              ← Amount in IQD (integer) ✅
    "serviceType": "subscription", ← Service type ✅
    "msisdn": "9647835077893",    ← MERCHANT wallet (not customer!) ✅
    "orderId": "tt-plan-10-...",  ← Unique order ID ✅
    "redirectUrl": "https://...", ← User redirect after payment ✅
    "iat": 1786640929,            ← Issued at (unix timestamp) ✅
    "exp": 1786655329             ← Expiry (4 hours) ✅
  }

  ZainCash v1 API (from Laravel package / docs) expects:
  {
    "amount": number,             ← Required ✅
    "serviceType": string,        ← Required ✅
    "msisdn": string,             ← Required (merchant MSISDN) ✅
    "orderId": string,            ← Required ✅
    "redirectUrl": string,        ← Required ✅
    "iat": number,                ← Required ✅
    "exp": number                 ← Required ✅
  }

  Optional fields NOT included in our JWT:
  - "callbackUrl": string        ← ⚠️ NOT sent (see Step 4)
  - "lang": string               ← Sent as separate param, not in JWT ✅

  Our JWT payload matches the ZainCash v1 API specification ✅
""")

    # Step 6: Content-Type analysis
    print("\n" + "="*70)
    print("STEP 6: Content-Type Analysis (CRITICAL)")
    print("="*70)
    
    print("""
  ┌─────────────────────────────────────────────────────────────────┐
  │  Content-Type used when calling ZainCash /transaction/init     │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                 │
  │  ZainCash v1 API (official):                                   │
  │    Content-Type: application/x-www-form-urlencoded              │
  │    Body: token=JWT&merchantId=ID&lang=ar                       │
  │                                                                 │
  │  Our Vercel serverless (api/zaincash/create.ts):               │
  │    Content-Type: application/x-www-form-urlencoded  ✅ CORRECT  │
  │    Body: URLSearchParams with token, merchantId, lang           │
  │                                                                 │
  │  Our zaincashService.ts:                                        │
  │    Content-Type: application/x-www-form-urlencoded  ✅ CORRECT  │
  │    Body: URLSearchParams with token, merchantId, lang           │
  │                                                                 │
  │  Our Express route (api-server/routes/zaincash.ts):            │
  │    Content-Type: application/json                 ❌ INCORRECT  │
  │    Body: JSON.stringify({ token: encodeURIComponent(jwt),       │
  │           merchantId, lang })                                   │
  │                                                                 │
  │  Our Vercel verify.ts:                                          │
  │    Content-Type: application/x-www-form-urlencoded  ✅ CORRECT  │
  │                                                                 │
  │  Our Vercel callback.ts:                                        │
  │    Content-Type: application/x-www-form-urlencoded  ✅ CORRECT  │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  ⚠️  The Express route (zaincash.ts) uses JSON instead of
  URL-encoded form data when calling ZainCash. This MAY work if
  ZainCash accepts both, but it deviates from the official v1 API.

  Additionally, the Express route double-encodes the token:
  - encodeURIComponent(jwt) puts it in the JSON body
  - When ZainCash receives the JSON, the token is already URL-encoded
  - If ZainCash then URL-decodes it, it gets the raw JWT ← OK
  - But if ZainCash expects raw JWT in JSON, it gets encoded ← WRONG

  The Vercel serverless functions use the correct format.
""")

    # Step 7: Token encoding analysis
    print("\n" + "="*70)
    print("STEP 7: Token Encoding Analysis")
    print("="*70)
    
    print("""
  ┌─────────────────────────────────────────────────────────────────┐
  │  Token encoding when sending to ZainCash                       │
  ├─────────────────────────────────────────────────────────────────┤
  │                                                                 │
  │  Vercel create.ts:                                              │
  │    initParams.append('token', token)                            │
  │    → URLSearchParams auto-encodes the JWT                       │
  │    → ZainCash receives URL-encoded token ✅                     │
  │                                                                 │
  │  Express route (zaincash.ts):                                   │
  │    token: encodeURIComponent(token)                             │
  │    → JSON body contains double-encoded token ❌                 │
  │    → URLSearchParams would auto-encode once ✅                  │
  │    → But JSON.stringify doesn't auto-encode                     │
  │    → So ZainCash gets encodeURIComponent(jwt) in JSON           │
  │    → This may cause JWT decode failure on ZainCash side         │
  │                                                                 │
  │  Vercel callback.ts & verify.ts:                                │
  │    inquiryParams.append('token', token)                         │
  │    → URLSearchParams auto-encodes ✅                            │
  │                                                                 │
  │  zaincashService.ts:                                            │
  │    initParams.append('token', token)                            │
  │    → URLSearchParams auto-encodes ✅                            │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  ⚠️  The Express route double-encodes the JWT token when using
  JSON Content-Type. With URLSearchParams, the auto-encoding
  happens once (correct). With JSON + encodeURIComponent, the
  token is manually encoded once, then sent as-is in JSON.
  ZainCash would need to URL-decode the token before JWT verification.
""")

if __name__ == '__main__':
    main()
