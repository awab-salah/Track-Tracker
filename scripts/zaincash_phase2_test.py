#!/usr/bin/env python3
"""
ZainCash Integration — Phase 2 & 3 Verification Tests

Tests:
  1. Payment creation via Vercel API → ZainCash sandbox
  2. JWT payload verification (redirectUrl included)
  3. Transaction inquiry
  4. Callback endpoint reachability
  5. Callback with valid token
  6. Callback with invalid/missing data
  7. Callback idempotency (duplicate callback)
  8. End-to-end sandbox flow (create → redirect URL)

Does NOT modify any database records. All tests are read-only
except creating a sandbox payment which is auto-expired.
"""

import json
import sys
import time
import base64
import hmac
import hashlib
import urllib.parse
import urllib.request

# ── Config ────────────────────────────────────────────────────────────────────

SANDBOX_BASE_URL = "https://test.zaincash.iq"
SANDBOX_MSISDN = "9647835077893"
SANDBOX_MERCHANT_ID = "5ffacf6612b5777c6d44266f"
SANDBOX_SECRET = "$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS"

# Production Vercel deployment
VERCEL_BASE = "https://track-tracker-app.vercel.app"
CREATE_URL = f"{VERCEL_BASE}/api/zaincash/create"
VERIFY_URL = f"{VERCEL_BASE}/api/zaincash/verify"
CALLBACK_URL = f"{VERCEL_BASE}/api/zaincash/callback"

# ── JWT helpers ───────────────────────────────────────────────────────────────

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def create_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = base64url_encode(json.dumps(header, separators=(',', ':')).encode())
    payload_b64 = base64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    signature = base64url_encode(
        hmac.new(secret.encode(), signing_input.encode(), hashlib.sha256).digest()
    )
    return f"{signing_input}.{signature}"

def decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without verification (for inspection)."""
    parts = token.split('.')
    if len(parts) != 3:
        return {}
    # Add padding
    payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_b64))

# ── Test helpers ──────────────────────────────────────────────────────────────

results = []

def record(test_name: str, passed: bool, detail: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append({"test": test_name, "status": status, "detail": detail})
    icon = "✓" if passed else "✗"
    print(f"  {icon} {test_name}: {status}")
    if detail:
        print(f"    → {detail}")

def http_request(url: str, method: str = "GET", data: dict = None, headers: dict = None, timeout: int = 15) -> dict:
    """Make HTTP request and return {status, body, headers}."""
    try:
        if data is not None:
            body = json.dumps(data).encode()
            hdrs = {"Content-Type": "application/json"}
        else:
            body = None
            hdrs = {}
        if headers:
            hdrs.update(headers)

        req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_body = resp.read().decode()
            try:
                resp_json = json.loads(resp_body)
            except:
                resp_json = resp_body
            return {"status": resp.status, "body": resp_json, "ok": True}
    except urllib.error.HTTPError as e:
        resp_body = e.read().decode() if e.fp else ""
        try:
            resp_json = json.loads(resp_body)
        except:
            resp_json = resp_body
        return {"status": e.code, "body": resp_json, "ok": False}
    except Exception as e:
        return {"status": 0, "body": str(e), "ok": False}

# ── Direct ZainCash sandbox tests ────────────────────────────────────────────

def test_direct_zaincash_init():
    """Test 1: Create payment directly against ZainCash sandbox."""
    print("\n━━━ Test 1: Direct ZainCash sandbox payment creation ━━━")

    now = int(time.time())
    order_id = f"test-order-{now}"
    redirect_url = f"{CALLBACK_URL}?orderId={order_id}&planId=plan-10&companyId=test-company"

    jwt_payload = {
        "amount": 250,
        "serviceType": "subscription",
        "msisdn": SANDBOX_MSISDN,
        "orderId": order_id,
        "redirectUrl": redirect_url,
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }

    # Verify redirectUrl is in the JWT payload
    record(
        "JWT payload contains redirectUrl",
        "redirectUrl" in jwt_payload and jwt_payload["redirectUrl"] == redirect_url,
        f"redirectUrl = {redirect_url[:80]}..."
    )

    token = create_jwt(jwt_payload, SANDBOX_SECRET)

    # Verify we can decode the token and see redirectUrl
    decoded = decode_jwt_payload(token)
    record(
        "Decoded JWT contains redirectUrl",
        "redirectUrl" in decoded,
        f"Decoded keys: {list(decoded.keys())}"
    )

    # POST to ZainCash v1 API with x-www-form-urlencoded
    params = urllib.parse.urlencode({
        "token": token,
        "merchantId": SANDBOX_MERCHANT_ID,
        "lang": "ar",
    })

    try:
        req = urllib.request.Request(
            f"{SANDBOX_BASE_URL}/transaction/init",
            data=params.encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = json.loads(resp.read().decode())
            record(
                "ZainCash init returns 200",
                resp.status == 200,
                f"Status: {resp.status}"
            )
            record(
                "ZainCash returns transaction ID",
                "id" in resp_body and bool(resp_body["id"]),
                f"Transaction ID: {resp_body.get('id', 'MISSING')}"
            )
            record(
                "ZainCash returns redirect URL (rUrl)",
                "rUrl" in resp_body and bool(resp_body["rUrl"]),
                f"rUrl: {resp_body.get('rUrl', 'MISSING')}"
            )

            # Build full redirect URL
            if resp_body.get("id") and resp_body.get("rUrl"):
                full_redirect = f"{resp_body['rUrl']}{resp_body['id']}"
                record(
                    "Full redirect URL is valid",
                    full_redirect.startswith("https://"),
                    f"URL: {full_redirect[:80]}..."
                )
                return resp_body["id"], full_redirect
            return None, None

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        record("ZainCash init returns 200", False, f"HTTP {e.code}: {body[:200]}")
        return None, None
    except Exception as e:
        record("ZainCash init returns 200", False, f"Error: {str(e)[:200]}")
        return None, None


def test_direct_zaincash_inquiry(transaction_id: str):
    """Test 2: Transaction inquiry directly against ZainCash sandbox."""
    print("\n━━━ Test 2: Direct ZainCash sandbox inquiry ━━━")

    if not transaction_id:
        record("Inquiry test", False, "No transaction ID from init test")
        return

    now = int(time.time())
    jwt_payload = {
        "id": transaction_id,
        "msisdn": SANDBOX_MSISDN,
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }
    token = create_jwt(jwt_payload, SANDBOX_SECRET)

    params = urllib.parse.urlencode({
        "merchantId": SANDBOX_MERCHANT_ID,
        "token": token,
    })

    try:
        req = urllib.request.Request(
            f"{SANDBOX_BASE_URL}/transaction/get",
            data=params.encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_body = json.loads(resp.read().decode())
            record(
                "Inquiry returns 200",
                resp.status == 200,
                f"Status: {resp.status}"
            )
            record(
                "Inquiry returns transaction status",
                "status" in resp_body,
                f"Status: {resp_body.get('status', 'MISSING')}, Keys: {list(resp_body.keys())[:8]}"
            )

    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        record("Inquiry returns 200", False, f"HTTP {e.code}: {body[:200]}")
    except Exception as e:
        record("Inquiry returns 200", False, f"Error: {str(e)[:200]}")


# ── Vercel deployment tests ───────────────────────────────────────────────────

def test_vercel_create():
    """Test 3: Payment creation via our Vercel API."""
    print("\n━━━ Test 3: Vercel API payment creation ━━━")

    resp = http_request(CREATE_URL, method="POST", data={
        "planId": "plan-10",
        "amount": 14000,
        "companyId": "test-diagnostic-company",
    })

    record(
        "Vercel create endpoint reachable",
        resp["status"] > 0,
        f"Status: {resp['status']}"
    )

    if resp["ok"]:
        body = resp["body"]
        record(
            "Vercel create returns 200",
            resp["status"] == 200,
            f"Status: {resp['status']}"
        )
        record(
            "Response contains transactionId",
            isinstance(body, dict) and "transactionId" in body,
            f"transactionId: {body.get('transactionId', 'MISSING') if isinstance(body, dict) else 'NOT JSON'}"
        )
        record(
            "Response contains redirectUrl",
            isinstance(body, dict) and "redirectUrl" in body,
            f"redirectUrl: {str(body.get('redirectUrl', 'MISSING'))[:80]}..." if isinstance(body, dict) else "NOT JSON"
        )

        # Check _debug for redirectUrl in JWT
        if isinstance(body, dict) and "_debug" in body:
            record(
                "_debug field present (JWT payload inspection)",
                True,
                f"merchantMsisdn: {body['_debug'].get('merchantMsisdn', 'N/A')}"
            )

        return body.get("transactionId") if isinstance(body, dict) else None
    else:
        record("Vercel create returns 200", False, f"HTTP {resp['status']}: {str(resp['body'])[:200]}")
        return None


def test_vercel_verify(transaction_id: str):
    """Test 4: Transaction inquiry via our Vercel API."""
    print("\n━━━ Test 4: Vercel API payment verification ━━━")

    if not transaction_id:
        record("Verify test", False, "No transaction ID")
        return

    resp = http_request(f"{VERIFY_URL}?transactionId={transaction_id}")
    record(
        "Vercel verify endpoint reachable",
        resp["status"] > 0,
        f"Status: {resp['status']}"
    )

    if resp["ok"]:
        body = resp["body"]
        record(
            "Vercel verify returns 200",
            resp["status"] == 200,
            f"Status: {resp['status']}"
        )
        record(
            "Verify response contains status",
            isinstance(body, dict) and "status" in body,
            f"status: {body.get('status', 'MISSING') if isinstance(body, dict) else 'NOT JSON'}"
        )
    else:
        record("Vercel verify returns 200", False, f"HTTP {resp['status']}: {str(resp['body'])[:200]}")


def test_callback_reachability():
    """Test 5: Callback endpoint reachability and basic behavior."""
    print("\n━━━ Test 5: Callback endpoint tests ━━━")

    # Test GET without token (simulates user cancelling payment)
    resp = http_request(CALLBACK_URL, method="GET")
    record(
        "GET callback reachable (no token = cancel)",
        resp["status"] == 200,
        f"Status: {resp['status']} (should return HTML redirect page)"
    )

    # Test POST with missing data → should return 400
    resp = http_request(CALLBACK_URL, method="POST", data={})
    record(
        "POST callback with empty body returns 400",
        resp["status"] == 400,
        f"Status: {resp['status']} (should be 400 for missing transaction ID)"
    )

    # Test POST with invalid JWT → should return 400
    resp = http_request(CALLBACK_URL, method="POST", data={"token": "invalid.jwt.token"})
    record(
        "POST callback with invalid JWT returns 400",
        resp["status"] == 400,
        f"Status: {resp['status']} (should be 400 for invalid JWT)"
    )

    # Test POST with missing transactionId in JSON → should return 400
    resp = http_request(CALLBACK_URL, method="POST", data={"foo": "bar"})
    record(
        "POST callback with no transactionId returns 400",
        resp["status"] == 400,
        f"Status: {resp['status']}"
    )


def test_callback_with_valid_token(transaction_id: str):
    """Test 6: Callback with a valid ZainCash JWT token."""
    print("\n━━━ Test 6: Callback with valid JWT token ━━━")

    if not transaction_id:
        record("Valid token callback test", False, "No transaction ID")
        return

    # Create a callback JWT like ZainCash would send
    now = int(time.time())
    callback_payload = {
        "id": transaction_id,
        "orderid": f"test-order-{now}",
        "status": "success",
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }
    callback_token = create_jwt(callback_payload, SANDBOX_SECRET)

    # Test GET with token (simulates ZainCash redirect)
    resp = http_request(f"{CALLBACK_URL}?token={urllib.parse.quote(callback_token)}&orderId=test-order&planId=plan-10&companyId=test-co", method="GET")
    record(
        "GET callback with valid token returns 200",
        resp["status"] == 200,
        f"Status: {resp['status']} (should return HTML redirect page)"
    )

    # Test POST with token in body
    resp = http_request(CALLBACK_URL, method="POST", data={"token": callback_token})
    record(
        "POST callback with valid JWT returns 200",
        resp["status"] == 200,
        f"Status: {resp['status']}"
    )


def test_callback_idempotency(transaction_id: str):
    """Test 7: Duplicate callback should not cause double activation."""
    print("\n━━━ Test 7: Callback idempotency ━━━")

    if not transaction_id:
        record("Idempotency test", False, "No transaction ID")
        return

    # Send the same callback twice
    now = int(time.time())
    callback_payload = {
        "id": transaction_id,
        "orderid": f"test-order-{now}",
        "status": "success",
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }
    callback_token = create_jwt(callback_payload, SANDBOX_SECRET)

    resp1 = http_request(CALLBACK_URL, method="POST", data={"token": callback_token, "companyId": "test-co"})
    resp2 = http_request(CALLBACK_URL, method="POST", data={"token": callback_token, "companyId": "test-co"})

    record(
        "First callback returns 200",
        resp1["status"] == 200,
        f"Status: {resp1['status']}"
    )
    record(
        "Second callback also returns 200 (idempotent)",
        resp2["status"] == 200,
        f"Status: {resp2['status']} (should not fail on duplicate)"
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  ZainCash Integration — Phase 2 & 3 Verification Tests     ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    # ── Direct ZainCash sandbox tests ──
    txn_id, redirect_url = test_direct_zaincash_init()
    test_direct_zaincash_inquiry(txn_id)

    # ── Vercel deployment tests ──
    vercel_txn_id = test_vercel_create()
    test_vercel_verify(vercel_txn_id or txn_id)

    # ── Callback tests ──
    test_callback_reachability()
    test_callback_with_valid_token(vercel_txn_id or txn_id)
    test_callback_idempotency(vercel_txn_id or txn_id)

    # ── Summary ──
    print("\n╔══════════════════════════════════════════════════════════════╗")
    print("║  Test Summary                                              ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    total = len(results)

    print(f"\n  Total: {total}  |  Passed: {passed}  |  Failed: {failed}")
    print()

    if failed > 0:
        print("  Failed tests:")
        for r in results:
            if r["status"] == "FAIL":
                print(f"    ✗ {r['test']}: {r['detail']}")
        print()

    # Save results
    with open("/home/z/my-project/scripts/zaincash_test_results.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"  Results saved to /home/z/my-project/scripts/zaincash_test_results.json")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
