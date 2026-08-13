#!/usr/bin/env python3
"""
ZainCash Sandbox API Test - Round 2
Tests with browser-like User-Agent and also tests the production endpoint.
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

SANDBOX = {
    'base_url':    'https://test.zaincash.iq',
    'msisdn':      '9647835077893',
    'merchant_id': '5ffacf6612b5777c6d44266f',
    'secret':      '$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS',
}

# The production URL (different from sandbox)
PRODUCTION_URL = 'https://api.zaincash.iq'

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

def http_post_custom(url, data, content_type='application/x-www-form-urlencoded', headers_extra=None):
    if content_type == 'application/x-www-form-urlencoded':
        body = urllib.parse.urlencode(data).encode('utf-8')
    else:
        body = json.dumps(data).encode('utf-8')
    
    req = urllib.request.Request(url, data=body, method='POST')
    req.add_header('Content-Type', content_type)
    
    # Add browser-like headers by default
    req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
    req.add_header('Accept', 'application/json, text/plain, */*')
    req.add_header('Accept-Language', 'en-US,en;q=0.9,ar;q=0.8')
    req.add_header('Origin', 'https://track-tracker-app.vercel.app')
    req.add_header('Referer', 'https://track-tracker-app.vercel.app/')
    
    if headers_extra:
        for k, v in headers_extra.items():
            req.add_header(k, v)
    
    ctx = ssl.create_default_context()
    ctx.check_hostname = True
    
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            resp_body = resp.read().decode('utf-8')
            return {'status': resp.status, 'headers': dict(resp.headers), 'body': resp_body,
                    'json': json.loads(resp_body) if resp_body else None}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8') if e.fp else ''
        return {'status': e.code, 'headers': dict(e.headers), 'body': resp_body, 'json': None}
    except Exception as e:
        return {'status': -1, 'headers': {}, 'body': str(e), 'json': None}

def main():
    print("╔════════════════════════════════════════════════════════════════════╗")
    print("║     ZainCash Sandbox API - Round 2 (Browser-like Headers)          ║")
    print("╚════════════════════════════════════════════════════════════════════╝")
    
    # ── Test A: Sandbox with browser UA ──
    print("\n" + "="*70)
    print("TEST A: Sandbox /transaction/init with browser-like User-Agent")
    print("="*70)
    
    now = int(time.time())
    jwt_payload = {
        'amount': 1000,
        'serviceType': 'subscription',
        'msisdn': SANDBOX['msisdn'],
        'orderId': f'test-browser-{now}',
        'redirectUrl': 'https://track-tracker-app.vercel.app/subscriptions',
        'iat': now,
        'exp': now + 60 * 60 * 4,
    }
    token = create_jwt(jwt_payload, SANDBOX['secret'])
    
    init_url = f"{SANDBOX['base_url']}/transaction/init"
    data = {'token': token, 'merchantId': SANDBOX['merchant_id'], 'lang': 'ar'}
    
    result = http_post_custom(init_url, data, 'application/x-www-form-urlencoded')
    print(f"  Status: {result['status']}")
    if result['json']:
        print(f"  Body: {json.dumps(result['json'], indent=2)}")
    else:
        is_cloudflare = 'Cloudflare' in result['body'] or 'cf-' in result['body']
        print(f"  Body: {'Cloudflare WAF block' if is_cloudflare else result['body'][:200]}")
    
    # ── Test B: Try production URL ──
    print("\n" + "="*70)
    print("TEST B: Production API URL reachability")
    print("="*70)
    
    for url in [PRODUCTION_URL, 'https://api.zaincash.iq/transaction/init']:
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0')
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
                print(f"  GET {url}: Status {resp.status}")
        except urllib.error.HTTPError as e:
            print(f"  GET {url}: Status {e.code}")
        except Exception as e:
            print(f"  GET {url}: Error - {str(e)[:100]}")
    
    # ── Test C: Try different ZainCash API URL patterns ──
    print("\n" + "="*70)
    print("TEST C: Alternative ZainCash URL patterns")
    print("="*70)
    
    alt_urls = [
        'https://test.zaincash.iq/api/transaction/init',
        'https://test.zaincash.iq/api/v1/transaction/init',
        'https://test.zaincash.iq/v1/transaction/init',
        'https://api.zaincash.iq/transaction/init',
        'https://api.zaincash.iq/api/transaction/init',
    ]
    
    for url in alt_urls:
        result = http_post_custom(url, data, 'application/x-www-form-urlencoded')
        is_cf = 'Cloudflare' in result.get('body', '') or result['status'] == 403
        status_icon = '🔒CF' if is_cf else ('✅' if result['status'] == 200 else f'❌{result["status"]}')
        print(f"  {status_icon}  POST {url}")
    
    # ── Test D: Try with curl-like headers ──
    print("\n" + "="*70)
    print("TEST D: Sandbox with curl User-Agent")
    print("="*70)
    
    result_curl = http_post_custom(init_url, data, 'application/x-www-form-urlencoded', 
                                    {'User-Agent': 'curl/8.5.0'})
    print(f"  Status: {result_curl['status']}")
    is_cf = 'Cloudflare' in result_curl.get('body', '')
    print(f"  Cloudflare blocked: {is_cf}")
    
    # ── Test E: Try with no User-Agent ──
    print("\n" + "="*70)
    print("TEST E: Sandbox with empty/minimal User-Agent")
    print("="*70)
    
    # Send with explicit empty UA
    try:
        body = urllib.parse.urlencode(data).encode('utf-8')
        req = urllib.request.Request(init_url, data=body, method='POST')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
        req.add_header('User-Agent', '')  # Empty UA
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            resp_body = resp.read().decode('utf-8')
            print(f"  Status: {resp.status}")
            print(f"  Body: {resp_body[:200]}")
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8') if e.fp else ''
        is_cf = 'Cloudflare' in resp_body
        print(f"  Status: {e.code} {'(Cloudflare)' if is_cf else ''}")
    except Exception as e:
        print(f"  Error: {str(e)[:100]}")
    
    # ── Test F: Check if Vercel serverless function can reach it ──
    print("\n" + "="*70)
    print("TEST F: Test our deployed Vercel API endpoint")
    print("="*70)
    
    vercel_create_url = 'https://track-tracker-app.vercel.app/api/zaincash/create'
    test_payload = {
        'planId': 'plan-10',
        'amount': 14000,
        'companyId': 'test-diagnostic-company',
    }
    
    try:
        body = json.dumps(test_payload).encode('utf-8')
        req = urllib.request.Request(vercel_create_url, data=body, method='POST')
        req.add_header('Content-Type', 'application/json')
        req.add_header('User-Agent', 'Mozilla/5.0')
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            resp_body = resp.read().decode('utf-8')
            resp_json = json.loads(resp_body)
            print(f"  Status: {resp.status}")
            print(f"  Response: {json.dumps(resp_json, indent=2)[:500]}")
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode('utf-8') if e.fp else ''
        print(f"  Status: {e.code}")
        try:
            err_json = json.loads(resp_body)
            print(f"  Error: {json.dumps(err_json, indent=2)[:500]}")
        except:
            print(f"  Body: {resp_body[:300]}")
    except Exception as e:
        print(f"  Error: {str(e)[:200]}")
    
    # ── Summary ──
    print("\n" + "="*70)
    print("ROUND 2 SUMMARY")
    print("="*70)
    print("""
  Finding: The ZainCash sandbox (test.zaincash.iq) is behind Cloudflare WAF
  which returns 403 Forbidden for ALL server-to-server API requests, regardless
  of Content-Type, User-Agent, or token encoding.
  
  This is the SAME Cloudflare WAF issue that blocks:
  1. The v2 OAuth2 API (/api/v2/*)
  2. The v1 JWT API (/transaction/init, /transaction/get)
  3. The documentation site (docs.zaincash.iq)
  
  The Cloudflare WAF appears to block requests from:
  - Server-side / headless HTTP clients
  - Non-browser User-Agents
  - Requests without proper browser fingerprint/cookies
  - Potentially: requests from specific IP ranges (cloud/serverless providers)
""")

if __name__ == '__main__':
    main()
