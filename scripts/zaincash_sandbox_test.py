#!/usr/bin/env python3
"""
ZainCash Sandbox API Test Script
================================
Tests the ZainCash v1 JWT API against the sandbox environment.
Compares our implementation against official docs/GitHub references.
"""

import json
import time
import base64
import hmac
import hashlib
import urllib.parse
import urllib.request
import urllib.error
import ssl

# ── Sandbox Credentials (from our code's SANDBOX_DEFAULTS) ──
# These come from the ZainCash Laravel package GitHub repo
SANDBOX = {
    'base_url':    'https://test.zaincash.iq',
    'msisdn':      '9647835077893',
    'merchant_id': '5ffacf6612b5777c6d44266f',
    'secret':      '$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS',
}

# Test wallets (from ZainCash docs, logged in our create.ts)
TEST_WALLETS = [
    {'msisdn': '9647802999569', 'pin': '1111', 'otp': '111111'},
    {'msisdn': '9647829744432', 'pin': '1111', 'otp': '111111'},
    {'msisdn': '9647829744464', 'pin': '1111', 'otp': '111111'},
    {'msisdn': '9647829744474', 'pin': '1111', 'otp': '111111'},
]

# ── JWT Helpers ──

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def create_jwt(payload: dict, secret: str) -> str:
    header = {'alg': 'HS256', 'typ': 'JWT'}
    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    
    signing_input = f'{header_b64}.{payload_b64}'.encode('ascii')
    signature = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)
    
    return f'{header_b64}.{payload_b64}.{signature_b64}'

def decode_jwt(token: str, secret: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError('Invalid JWT format')
    
    # Verify signature
    signing_input = f'{parts[0]}.{parts[1]}'.encode('ascii')
    expected_sig = base64url_encode(
        hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    )
    if expected_sig != parts[2]:
        raise ValueError('JWT signature verification failed')
    
    # Decode payload
    payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
    payload_json = base64.urlsafe_b64decode(payload_b64)
    return json.loads(payload_json)

# ── HTTP Helper ──

def http_post(url: str, data: dict, content_type: str = 'application/x-www-form-urlencoded') -> dict:
    """Make a POST request and return {status, headers, body}"""
    if content_type == 'application/x-www-form-urlencoded':
        body = urllib.parse.urlencode(data).encode('utf-8')
    else:  # application/json
        body = json.dumps(data).encode('utf-8')
    
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', content_type)
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = True
    
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            resp_body = resp.read().decode('utf-8')
            return {
                'status': resp.status,
                'headers': dict(resp.headers),
                'body': resp_body,
                'json': json.loads(resp_body) if resp_body else None,
            }
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8') if e.fp else ''
        return {
            'status': e.code,
            'headers': dict(e.headers),
            'body': resp_body,
            'json': None,
        }
    except Exception as e:
        return {
            'status': -1,
            'headers': {},
            'body': str(e),
            'json': None,
        }

# ── Test Functions ──

def test_1_sandbox_connectivity():
    """Test 1: Can we reach the ZainCash sandbox at all?"""
    print("\n" + "="*70)
    print("TEST 1: Sandbox Connectivity")
    print("="*70)
    
    # Try a simple GET to the base URL
    try:
        req = urllib.request.Request(SANDBOX['base_url'])
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            print(f"  GET {SANDBOX['base_url']}")
            print(f"  Status: {resp.status}")
            print(f"  Result: ✅ Sandbox is reachable")
            return True
    except urllib.error.HTTPError as e:
        print(f"  GET {SANDBOX['base_url']}")
        print(f"  Status: {e.code}")
        print(f"  Result: ⚠️ Sandbox returned HTTP {e.code} (but is reachable)")
        return True  # Server is there, just may redirect or require auth
    except Exception as e:
        print(f"  GET {SANDBOX['base_url']}")
        print(f"  Error: {e}")
        print(f"  Result: ❌ Sandbox is NOT reachable")
        return False

def test_2_transaction_init_urlencoded():
    """Test 2: Create transaction using application/x-www-form-urlencoded (v1 standard)"""
    print("\n" + "="*70)
    print("TEST 2: Transaction Init (application/x-www-form-urlencoded)")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,  # 1000 IQD (minimum amount)
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-{now}-{hashlib.md5(str(now).encode()).hexdigest()[:6]}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    print(f"  JWT Payload: {json.dumps(jwt_payload, indent=2)}")
    print(f"  Token (first 80 chars): {token[:80]}...")
    
    init_url = f"{SANDBOX['base_url']}/transaction/init"
    data = {
        'token': token,
        'merchantId': SANDBOX['merchant_id'],
        'lang': 'ar',
    }
    
    print(f"\n  POST {init_url}")
    print(f"  Content-Type: application/x-www-form-urlencoded")
    print(f"  Body keys: {list(data.keys())}")
    
    result = http_post(init_url, data, 'application/x-www-form-urlencoded')
    
    print(f"\n  Response Status: {result['status']}")
    if result['status'] > 0:
        print(f"  Response Headers: Content-Type={result['headers'].get('Content-Type', 'N/A')}")
    
    if result['json']:
        print(f"  Response Body: {json.dumps(result['json'], indent=2)}")
    else:
        print(f"  Response Body (raw): {result['body'][:500]}")
    
    success = result['status'] == 200 and result['json'] and result['json'].get('id')
    
    if success:
        print(f"\n  Result: ✅ Transaction created successfully")
        print(f"  Transaction ID: {result['json'].get('id')}")
        print(f"  Redirect URL: {result['json'].get('rUrl', 'N/A')}{result['json'].get('id', '')}")
    else:
        print(f"\n  Result: ❌ Transaction creation failed")
    
    return result

def test_3_transaction_init_json():
    """Test 3: Create transaction using application/json (our Express route does this)"""
    print("\n" + "="*70)
    print("TEST 3: Transaction Init (application/json)")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-json-{now}-{hashlib.md5(str(now).encode()).hexdigest()[:6]}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    init_url = f"{SANDBOX['base_url']}/transaction/init"
    data = {
        'token': urllib.parse.quote(token, safe=''),  # URL-encode the token (as our Express route does)
        'merchantId': SANDBOX['merchant_id'],
        'lang': 'ar',
    }
    
    print(f"  POST {init_url}")
    print(f"  Content-Type: application/json")
    print(f"  Token is URL-encoded: Yes (encodeURIComponent)")
    
    result = http_post(init_url, data, 'application/json')
    
    print(f"\n  Response Status: {result['status']}")
    if result['json']:
        print(f"  Response Body: {json.dumps(result['json'], indent=2)}")
    else:
        print(f"  Response Body (raw): {result['body'][:500]}")
    
    success = result['status'] == 200 and result['json'] and result['json'].get('id')
    
    if success:
        print(f"\n  Result: ✅ Transaction created with JSON Content-Type")
    else:
        print(f"\n  Result: ❌ Transaction creation failed with JSON Content-Type")
        print(f"  NOTE: This is a SIGNIFICANT finding - our Express route (zaincash.ts) uses JSON!")
    
    return result

def test_4_transaction_init_json_no_urlencode():
    """Test 4: Create transaction with JSON but WITHOUT URL-encoding the token"""
    print("\n" + "="*70)
    print("TEST 4: Transaction Init (JSON, token NOT URL-encoded)")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-noenc-{now}-{hashlib.md5(str(now).encode()).hexdigest()[:6]}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    init_url = f"{SANDBOX['base_url']}/transaction/init"
    data = {
        'token': token,  # Raw JWT, NOT URL-encoded
        'merchantId': SANDBOX['merchant_id'],
        'lang': 'ar',
    }
    
    print(f"  POST {init_url}")
    print(f"  Content-Type: application/json")
    print(f"  Token is URL-encoded: No (raw JWT)")
    
    result = http_post(init_url, data, 'application/json')
    
    print(f"\n  Response Status: {result['status']}")
    if result['json']:
        print(f"  Response Body: {json.dumps(result['json'], indent=2)}")
    else:
        print(f"  Response Body (raw): {result['body'][:500]}")
    
    success = result['status'] == 200 and result['json'] and result['json'].get('id')
    print(f"\n  Result: {'✅' if success else '❌'} Transaction creation {'succeeded' if success else 'failed'}")
    
    return result

def test_5_inquiry_api(transaction_id=None):
    """Test 5: Transaction Inquiry API (POST /transaction/get)"""
    print("\n" + "="*70)
    print("TEST 5: Transaction Inquiry API")
    print("="*70)
    
    if not transaction_id:
        # Try to create one first
        print("  No transaction ID provided. Creating one first...")
        create_result = test_2_transaction_init_urlencoded()
        if create_result.get('json') and create_result['json'].get('id'):
            transaction_id = create_result['json']['id']
        else:
            print("  ❌ Cannot test inquiry - failed to create transaction")
            return None
    
    now = int(time.time())
    jwt_payload = {
        'id': transaction_id,
        'msisdn': SANDBOX['msisdn'],
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    # Test with application/x-www-form-urlencoded (official v1 standard)
    inquiry_url = f"{SANDBOX['base_url']}/transaction/get"
    data_urlenc = {
        'merchantId': SANDBOX['merchant_id'],
        'token': token,
    }
    
    print(f"\n  --- Test 5a: Inquiry with x-www-form-urlencoded ---")
    print(f"  POST {inquiry_url}")
    
    result_urlenc = http_post(inquiry_url, data_urlenc, 'application/x-www-form-urlencoded')
    print(f"  Response Status: {result_urlenc['status']}")
    if result_urlenc['json']:
        print(f"  Response Body: {json.dumps(result_urlenc['json'], indent=2)}")
    else:
        print(f"  Response Body (raw): {result_urlenc['body'][:500]}")
    
    # Test with application/json (what our Express route uses)
    data_json = {
        'merchantId': SANDBOX['merchant_id'],
        'token': urllib.parse.quote(token, safe=''),
    }
    
    print(f"\n  --- Test 5b: Inquiry with application/json ---")
    result_json = http_post(inquiry_url, data_json, 'application/json')
    print(f"  Response Status: {result_json['status']}")
    if result_json['json']:
        print(f"  Response Body: {json.dumps(result_json['json'], indent=2)}")
    else:
        print(f"  Response Body (raw): {result_json['body'][:500]}")
    
    return {
        'transaction_id': transaction_id,
        'urlencoded': result_urlenc,
        'json': result_json,
    }

def test_6_amount_type_check():
    """Test 6: Does the amount need to be integer (not float)?"""
    print("\n" + "="*70)
    print("TEST 6: Amount Type Check (integer vs float)")
    print("="*70)
    
    results = {}
    
    for amount_val, label in [(1000, 'integer'), (1000.0, 'float'), (1000.5, 'float_with_decimal')]:
        now = int(time.time())
        jwt_payload = {
            'amount': amount_val,
            'serviceType': 'subscription',
            'msisdn': SANDBOX['msisdn'],
            'orderId': f'test-amt-{label}-{now}',
            'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
            'iat': now,
            'exp': now + 60 * 60 * 4,
        }
        
        token = create_jwt(jwt_payload, SANDBOX['secret'])
        
        init_url = f"{SANDBOX['base_url']}/transaction/init"
        data = {
            'token': token,
            'merchantId': SANDBOX['merchant_id'],
            'lang': 'ar',
        }
        
        print(f"\n  --- Amount: {amount_val} (type: {label}) ---")
        result = http_post(init_url, data, 'application/x-www-form-urlencoded')
        print(f"  Status: {result['status']}")
        if result['json']:
            if result['json'].get('id'):
                print(f"  ✅ Success - Transaction ID: {result['json']['id']}")
            elif result['json'].get('err'):
                print(f"  ❌ Error: {result['json']['err']}")
            else:
                print(f"  Response: {json.dumps(result['json'])[:200]}")
        else:
            print(f"  Response: {result['body'][:200]}")
        
        results[label] = result
    
    return results

def test_7_redirect_url_format():
    """Test 7: Check the redirect URL format from transaction/init response"""
    print("\n" + "="*70)
    print("TEST 7: Redirect URL Format")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-redirect-{now}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    init_url = f"{SANDBOX['base_url']}/transaction/init"
    data = {
        'token': token,
        'merchantId': SANDBOX['merchant_id'],
        'lang': 'ar',
    }
    
    result = http_post(init_url, data, 'application/x-www-form-urlencoded')
    
    if result['json'] and result['json'].get('id'):
        tx_id = result['json']['id']
        r_url = result['json'].get('rUrl', '')
        full_redirect = f"{r_url}{tx_id}" if r_url else f"{SANDBOX['base_url']}/transaction/pay?id={tx_id}"
        
        print(f"  Transaction ID: {tx_id}")
        print(f"  rUrl from API: {r_url}")
        print(f"  Full redirect URL: {full_redirect}")
        print(f"\n  Our code builds: rUrl + id = {r_url}{tx_id}")
        print(f"  Alternative: baseUrl/transaction/pay?id={tx_id}")
        
        # Check if the redirect URL is accessible
        try:
            req = urllib.request.Request(full_redirect)
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
                print(f"\n  Redirect URL Status: {resp.status}")
                print(f"  ✅ Redirect URL is accessible")
        except urllib.error.HTTPError as e:
            # 302 redirect is expected for payment page
            print(f"\n  Redirect URL Status: {e.code}")
            if e.code in (302, 301, 303, 307):
                location = e.headers.get('Location', 'N/A')
                print(f"  Redirects to: {location}")
                print(f"  ✅ Redirect URL works (HTTP {e.code})")
            else:
                print(f"  ⚠️ Unexpected status code")
        except Exception as e:
            print(f"\n  Error accessing redirect URL: {e}")
    else:
        print(f"  ❌ Cannot test redirect URL - transaction creation failed")
        print(f"  Status: {result['status']}, Body: {result['body'][:300]}")

def test_8_msisdn_type_in_jwt():
    """Test 8: Does msisdn need to be string (not number) in JWT?"""
    print("\n" + "="*70)
    print("TEST 8: MSISDN Type in JWT (string vs number)")
    print("="*70)
    
    results = {}
    
    for msisdn_val, label in [(SANDBOX['msisdn'], 'string'), (int(SANDBOX['msisdn']), 'number')]:
        now = int(time.time())
        jwt_payload = {
            'amount': 1000,
            'serviceType': 'subscription',
            'msisdn': msisdn_val,
            'orderId': f'test-msisdn-{label}-{now}',
            'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
            'iat': now,
            'exp': now + 60 * 60 * 4,
        }
        
        token = create_jwt(jwt_payload, SANDBOX['secret'])
        
        init_url = f"{SANDBOX['base_url']}/transaction/init"
        data = {
            'token': token,
            'merchantId': SANDBOX['merchant_id'],
            'lang': 'ar',
        }
        
        print(f"\n  --- MSISDN: {msisdn_val} (type: {label}) ---")
        result = http_post(init_url, data, 'application/x-www-form-urlencoded')
        print(f"  Status: {result['status']}")
        if result['json']:
            if result['json'].get('id'):
                print(f"  ✅ Success - Transaction ID: {result['json']['id']}")
            elif result['json'].get('err'):
                print(f"  ❌ Error: {result['json']['err']}")
            else:
                print(f"  Response: {json.dumps(result['json'])[:200]}")
        else:
            print(f"  Response: {result['body'][:200]}")
        
        results[label] = result
    
    return results

def test_9_jwt_serialization_format():
    """Test 9: JWT serialization - compact (no spaces) vs pretty (with spaces)"""
    print("\n" + "="*70)
    print("TEST 9: JWT Serialization Format")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-ser-{now}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    
    # Our Node.js code uses JSON.stringify which may add spaces
    # Python json.dumps with separators=(',',':') is compact
    # Let's test both
    
    for separators, label in [
        ((',', ':'), 'compact_no_spaces'),
        ((', ', ': '), 'pretty_with_spaces'),
    ]:
        header = {'alg': 'HS256', 'typ': 'JWT'}
        header_b64 = base64url_encode(json.dumps(header, separators=separators).encode('utf-8'))
        payload_b64 = base64url_encode(json.dumps(jwt_payload, separators=separators).encode('utf-8'))
        
        signing_input = f'{header_b64}.{payload_b64}'.encode('ascii')
        signature = hmac.new(SANDBOX['secret'].encode('utf-8'), signing_input, hashlib.sha256).digest()
        signature_b64 = base64url_encode(signature)
        
        token = f'{header_b64}.{payload_b64}.{signature_b64}'
        
        init_url = f"{SANDBOX['base_url']}/transaction/init"
        data = {
            'token': token,
            'merchantId': SANDBOX['merchant_id'],
            'lang': 'ar',
        }
        
        print(f"\n  --- JWT format: {label} ---")
        result = http_post(init_url, data, 'application/x-www-form-urlencoded')
        print(f"  Status: {result['status']}")
        if result['json']:
            if result['json'].get('id'):
                print(f"  ✅ Success")
            elif result['json'].get('err'):
                print(f"  ❌ Error: {result['json']['err']}")
            else:
                print(f"  Response: {json.dumps(result['json'])[:200]}")
        else:
            print(f"  Response: {result['body'][:200]}")

def test_10_minimum_amount():
    """Test 10: What is the minimum amount accepted?"""
    print("\n" + "="*70)
    print("TEST 10: Minimum Amount Check")
    print("="*70)
    
    for amount in [1, 100, 250, 500, 1000]:
        now = int(time.time())
        jwt_payload = {
            'amount': amount,
            'serviceType': 'subscription',
            'msisdn': SANDBOX['msisdn'],
            'orderId': f'test-min-{amount}-{now}',
            'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
            'iat': now,
            'exp': now + 60 * 60 * 4,
        }
        
        token = create_jwt(jwt_payload, SANDBOX['secret'])
        
        init_url = f"{SANDBOX['base_url']}/transaction/init"
        data = {
            'token': token,
            'merchantId': SANDBOX['merchant_id'],
            'lang': 'ar',
        }
        
        result = http_post(init_url, data, 'application/x-www-form-urlencoded')
        status = result['status']
        has_id = result['json'] and result['json'].get('id')
        err = result['json'] and result['json'].get('err')
        
        icon = '✅' if has_id else '❌'
        err_msg = f" - {err}" if err else ""
        print(f"  Amount {amount:>5} IQD: {icon} (HTTP {status}{err_msg})")
        
        time.sleep(0.3)  # Small delay to avoid rate limiting

# ── Main ──

def main():
    print("╔════════════════════════════════════════════════════════════════════╗")
    print("║     ZainCash Sandbox API - Real End-to-End Testing                 ║")
    print("╚════════════════════════════════════════════════════════════════════╝")
    print(f"\nSandbox URL: {SANDBOX['base_url']}")
    print(f"Merchant ID: {SANDBOX['merchant_id']}")
    print(f"MSISDN: {SANDBOX['msisdn']}")
    print(f"Secret: {SANDBOX['secret'][:20]}...")
    print(f"Test Wallets: {len(TEST_WALLETS)} wallets")
    
    # Run all tests
    test_1_sandbox_connectivity()
    
    result_2 = test_2_transaction_init_urlencoded()
    
    result_3 = test_3_transaction_init_json()
    
    test_4_transaction_init_json_no_urlencode()
    
    # Get a transaction ID for inquiry test
    tx_id = None
    if result_2.get('json') and result_2['json'].get('id'):
        tx_id = result_2['json']['id']
    
    test_5_inquiry_api(tx_id)
    
    test_6_amount_type_check()
    
    test_7_redirect_url_format()
    
    test_8_msisdn_type_in_jwt()
    
    test_9_jwt_serialization_format()
    
    test_10_minimum_amount()
    
    # ── Summary ──
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    
    # Content-Type comparison
    print("\n📋 Content-Type Discrepancy:")
    print("  • Vercel serverless (create.ts): application/x-www-form-urlencoded ✅ (correct per v1 docs)")
    print("  • Express route (zaincash.ts):   application/json ⚠️ (may not match v1 API expectation)")
    print("  • zaincashService.ts:            application/x-www-form-urlencoded ✅ (correct)")
    
    print("\n📋 Token Encoding Discrepancy:")
    print("  • Express route (zaincash.ts):   encodeURIComponent(token) ⚠️ (double-encodes in URL-encoded body)")
    print("  • Vercel create.ts:              token appended as-is to URLSearchParams ✅")
    print("  • zaincashService.ts:            token appended as-is to URLSearchParams ✅")
    
    print("\n📋 MSISDN Type in JWT:")
    print("  • Our code sends msisdn as string: '9647835077893' ✅")
    print("  • ZainCash Laravel package also sends as string ✅")
    
    print("\n📋 Sandbox Credentials:")
    print(f"  • Merchant ID: {SANDBOX['merchant_id']}")
    print(f"  • MSISDN: {SANDBOX['msisdn']}")
    print(f"  • Secret: {SANDBOX['secret'][:30]}...")
    print(f"  • Source: ZainCash Laravel package GitHub repo")

if __name__ == '__main__':
    main()
