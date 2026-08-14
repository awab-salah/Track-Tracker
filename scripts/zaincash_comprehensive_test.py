#!/usr/bin/env python3
"""
ZainCash Integration — Comprehensive Test Suite (Phase 2 & 3)

Tests the complete payment flow against the Vercel deployment
and verifies callback endpoint behaviors.

Categorizes failures as:
  - OUR CODE: Issues in our integration code
  - ZAINCASH SANDBOX: ZainCash test environment issues
  - CLOUDFLARE: WAF/bot protection blocking requests
  - DEPLOYMENT: Code not yet deployed to Vercel
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

VERCEL_BASE = "https://track-tracker-app.vercel.app"
CREATE_URL = f"{VERCEL_BASE}/api/zaincash/create"
VERIFY_URL = f"{VERCEL_BASE}/api/zaincash/verify"
CALLBACK_URL = f"{VERCEL_BASE}/api/zaincash/callback"

# ── JWT helpers ───────────────────────────────────────────────────────────────

def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def create_jwt(payload: dict, secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    h = b64url_encode(json.dumps(header, separators=(',', ':')).encode())
    p = b64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    sig = b64url_encode(hmac.new(secret.encode(), f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{sig}"

def decode_jwt_payload(token: str) -> dict:
    parts = token.split('.')
    if len(parts) != 3:
        return {}
    payload_b64 = parts[1] + '=' * (4 - len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_b64))

# ── HTTP helpers ──────────────────────────────────────────────────────────────

results = []

def record(test_name: str, passed: bool, detail: str = "", category: str = ""):
    status = "PASS" if passed else "FAIL"
    results.append({"test": test_name, "status": status, "detail": detail, "category": category})
    icon = "✓" if passed else "✗"
    cat = f" [{category}]" if category and not passed else ""
    print(f"  {icon} {test_name}: {status}{cat}")
    if detail:
        print(f"    → {detail[:120]}")

def http_req(url: str, method: str = "GET", data: dict = None, timeout: int = 15) -> dict:
    try:
        body = json.dumps(data).encode() if data else None
        hdrs = {"Content-Type": "application/json"} if data else {}
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
            resp_json = resp_body[:500]
        return {"status": e.code, "body": resp_json, "ok": False}
    except Exception as e:
        return {"status": 0, "body": str(e), "ok": False}

def retry_http_req(url: str, method: str = "GET", data: dict = None, retries: int = 3, delay: float = 5.0) -> dict:
    """Retry HTTP request with delays (for flaky ZainCash sandbox)."""
    for i in range(retries):
        result = http_req(url, method, data)
        if result["ok"] or result["status"] != 0:
            return result
        if i < retries - 1:
            time.sleep(delay)
    return result

# ── Tests ────────────────────────────────────────────────────────────────────

def test_jwt_payload_structure():
    """Test 1: Verify JWT payload contains correct fields including redirectUrl."""
    print("\n━━━ Test 1: JWT Payload Structure ━━━")

    now = int(time.time())
    orderId = f"tt-plan-10-test-co-{now}-abc123"
    redirectUrl = f"{CALLBACK_URL}?orderId={orderId}&planId=plan-10&companyId=test-co"

    jwt_payload = {
        "amount": 14000,
        "serviceType": "subscription",
        "msisdn": SANDBOX_MSISDN,
        "orderId": orderId,
        "redirectUrl": redirectUrl,
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }

    token = create_jwt(jwt_payload, SANDBOX_SECRET)
    decoded = decode_jwt_payload(token)

    record("JWT has amount field", "amount" in decoded, f"amount = {decoded.get('amount')}")
    record("JWT has serviceType field", "serviceType" in decoded, f"serviceType = {decoded.get('serviceType')}")
    record("JWT has msisdn field", "msisdn" in decoded, f"msisdn = {decoded.get('msisdn')}")
    record("JWT has orderId field", "orderId" in decoded, f"orderId = {decoded.get('orderId')[:50]}...")
    record("JWT has redirectUrl field", "redirectUrl" in decoded, f"redirectUrl = {str(decoded.get('redirectUrl', ''))[:80]}...")
    record("redirectUrl points to callback endpoint",
           decoded.get("redirectUrl", "").startswith(CALLBACK_URL),
           f"Expected prefix: {CALLBACK_URL}")
    record("redirectUrl contains orderId param",
           "orderId=" in decoded.get("redirectUrl", ""),
           "Query params for callback fallback")
    record("redirectUrl contains companyId param",
           "companyId=" in decoded.get("redirectUrl", ""),
           "Query params for callback fallback")
    record("No callbackUrl field in JWT (v1 doesn't support it)",
           "callbackUrl" not in decoded,
           "ZainCash v1 uses redirectUrl for both redirect and callback")


def test_vercel_create_payment():
    """Test 2: Create payment via Vercel API."""
    print("\n━━━ Test 2: Vercel Payment Creation ━━━")

    resp = retry_http_req(CREATE_URL, method="POST", data={
        "planId": "plan-10",
        "amount": 14000,
        "companyId": "test-diagnostic",
    }, retries=3, delay=5)

    record("Vercel create endpoint reachable", resp["status"] > 0, f"Status: {resp['status']}")

    if resp["ok"] and isinstance(resp["body"], dict):
        body = resp["body"]
        txn_id = body.get("transactionId", "")
        redirect = body.get("redirectUrl", "")
        order_id = body.get("orderId", "")

        record("Create returns 200", resp["status"] == 200, f"Status: {resp['status']}")
        record("Response has transactionId", bool(txn_id), f"transactionId: {txn_id}")
        record("Response has redirectUrl", bool(redirect), f"redirectUrl: {redirect[:80]}")
        record("Response has orderId", bool(order_id), f"orderId: {order_id}")
        record("redirectUrl starts with https", redirect.startswith("https://"), f"URL: {redirect[:60]}")

        return txn_id, redirect, order_id
    else:
        detail = f"HTTP {resp['status']}"
        if isinstance(resp["body"], dict):
            detail += f": {resp['body'].get('error', str(resp['body'])[:100])}"
        elif isinstance(resp["body"], str):
            detail += f": {resp['body'][:100]}"
        record("Create returns 200", False, detail, "ZAINCASH SANDBOX")
        return None, None, None


def test_vercel_verify(txn_id: str):
    """Test 3: Verify payment status via Vercel API."""
    print("\n━━━ Test 3: Vercel Payment Verification ━━━")

    if not txn_id:
        record("Verify test", False, "No transaction ID from create test")
        return

    resp = http_req(f"{VERIFY_URL}?transactionId={txn_id}")
    record("Verify endpoint reachable", resp["status"] > 0, f"Status: {resp['status']}")

    if resp["ok"] and isinstance(resp["body"], dict):
        body = resp["body"]
        record("Verify returns 200", resp["status"] == 200, f"Status: {resp['status']}")
        record("Verify has transactionId", body.get("transactionId") == txn_id, f"ID: {body.get('transactionId')}")
        record("Verify has status field", "status" in body, f"status: {body.get('status')}")
        record("Verify has details object", "details" in body, f"details keys: {list(body.get('details', {}).keys())[:6]}")

        # Check that details contain useful information
        details = body.get("details", {})
        record("Details contain amount", "amount" in details, f"amount: {details.get('amount')}")
        record("Details contain orderId", "orderId" in details, f"orderId: {details.get('orderId', '')[:50]}")
    else:
        record("Verify returns 200", False, f"HTTP {resp['status']}: {str(resp['body'])[:100]}")


def test_callback_endpoint():
    """Test 4: Callback endpoint behavior tests."""
    print("\n━━━ Test 4: Callback Endpoint Behavior ━━━")

    # 4a: GET without token (cancel scenario)
    resp = http_req(CALLBACK_URL, method="GET")
    # Currently deployed code doesn't have GET handler → 404
    # After deployment, should return 200 with HTML redirect page
    if resp["status"] == 404:
        record("GET callback (no token = cancel)", False, "Returns 404 — GET handler not deployed yet", "DEPLOYMENT")
    elif resp["status"] == 200:
        record("GET callback (no token = cancel)", True, "Returns 200 with HTML redirect page")
    else:
        record("GET callback (no token = cancel)", False, f"Unexpected status: {resp['status']}", "OUR CODE")

    # 4b: POST with empty body → should return 400
    resp = http_req(CALLBACK_URL, method="POST", data={})
    record("POST empty body → 400", resp["status"] == 400, f"Status: {resp['status']}")

    # 4c: POST with invalid JWT → should return 400
    resp = http_req(CALLBACK_URL, method="POST", data={"token": "invalid.jwt.token"})
    record("POST invalid JWT → 400", resp["status"] == 400, f"Status: {resp['status']}")

    # 4d: POST with missing transactionId → should return 400
    resp = http_req(CALLBACK_URL, method="POST", data={"foo": "bar"})
    record("POST missing transactionId → 400", resp["status"] == 400, f"Status: {resp['status']}")

    # 4e: POST with null body → should return 400
    resp = http_req(CALLBACK_URL, method="POST", data={"id": None})
    record("POST null transactionId → 400", resp["status"] == 400, f"Status: {resp['status']}")


def test_callback_with_valid_data(txn_id: str):
    """Test 5: Callback with valid data."""
    print("\n━━━ Test 5: Callback With Valid Data ━━━")

    if not txn_id:
        record("Valid callback test", False, "No transaction ID")
        return

    # POST with valid JSON callback
    resp = http_req(CALLBACK_URL, method="POST", data={
        "id": txn_id,
        "companyId": "test-diagnostic",
    })

    record("POST valid JSON callback → 200", resp["status"] == 200, f"Status: {resp['status']}")

    if resp["ok"] and isinstance(resp["body"], dict):
        body = resp["body"]
        record("Callback response has received=true", body.get("received") == True, f"received: {body.get('received')}")
        record("Callback response has transactionId", body.get("transactionId") == txn_id, f"ID: {body.get('transactionId')}")
        record("Callback response has status", "status" in body, f"status: {body.get('status')}")


def test_callback_idempotency(txn_id: str):
    """Test 6: Duplicate callback should be harmless."""
    print("\n━━━ Test 6: Callback Idempotency ━━━")

    if not txn_id:
        record("Idempotency test", False, "No transaction ID")
        return

    # Send same callback twice
    resp1 = http_req(CALLBACK_URL, method="POST", data={"id": txn_id, "companyId": "test-diagnostic"})
    resp2 = http_req(CALLBACK_URL, method="POST", data={"id": txn_id, "companyId": "test-diagnostic"})

    record("First callback → 200", resp1["status"] == 200, f"Status: {resp1['status']}")
    record("Second callback → 200 (not error)", resp2["status"] == 200, f"Status: {resp2['status']}")

    # Both should return the same status
    if isinstance(resp1["body"], dict) and isinstance(resp2["body"], dict):
        s1 = resp1["body"].get("status")
        s2 = resp2["body"].get("status")
        record("Both callbacks return same status", s1 == s2, f"Status 1: {s1}, Status 2: {s2}")


def test_callback_with_jwt_token(txn_id: str):
    """Test 7: Callback with ZainCash-style JWT token."""
    print("\n━━━ Test 7: Callback With JWT Token ━━━")

    if not txn_id:
        record("JWT token callback test", False, "No transaction ID")
        return

    now = int(time.time())
    callback_payload = {
        "id": txn_id,
        "orderid": f"test-order-{now}",
        "status": "success",
        "iat": now,
        "exp": now + 60 * 60 * 4,
    }
    callback_token = create_jwt(callback_payload, SANDBOX_SECRET)

    # Verify our JWT encodes correctly
    decoded = decode_jwt_payload(callback_token)
    record("Callback JWT has id", decoded.get("id") == txn_id, f"id: {decoded.get('id')}")
    record("Callback JWT has status", decoded.get("status") == "success", f"status: {decoded.get('status')}")

    # POST with JWT token
    resp = http_req(CALLBACK_URL, method="POST", data={"token": callback_token})
    record("POST JWT callback → 200", resp["status"] == 200, f"Status: {resp['status']}")

    if resp["ok"] and isinstance(resp["body"], dict):
        record("JWT callback response has received=true", resp["body"].get("received") == True, f"received: {resp['body'].get('received')}")


def test_client_polling_fallback(txn_id: str):
    """Test 8: Client-side polling still works as fallback."""
    print("\n━━━ Test 8: Client-Side Polling Fallback ━━━")

    if not txn_id:
        record("Polling fallback test", False, "No transaction ID")
        return

    # The verify endpoint IS the polling mechanism
    resp = http_req(f"{VERIFY_URL}?transactionId={txn_id}")

    record("Polling via verify endpoint works", resp["status"] == 200, f"Status: {resp['status']}")

    if resp["ok"] and isinstance(resp["body"], dict):
        body = resp["body"]
        record("Polling returns consistent status", "status" in body, f"status: {body.get('status')}")
        # Should still be pending since no one completed the payment
        record("Unpaid transaction shows pending/processing",
               body.get("status") in ("pending", "processing"),
               f"status: {body.get('status')} (expected pending or processing)")


def test_e2e_sandbox_flow():
    """Test 9: End-to-end sandbox flow (as much as we can automate)."""
    print("\n━━━ Test 9: End-to-End Sandbox Flow ━━━")

    # Step 1: Create payment
    resp = retry_http_req(CREATE_URL, method="POST", data={
        "planId": "plan-10",
        "amount": 14000,
        "companyId": "e2e-test-company",
    }, retries=3, delay=5)

    if not resp["ok"]:
        record("E2E: Payment creation", False, f"Failed: {resp['status']}", "ZAINCASH SANDBOX")
        return

    body = resp["body"]
    txn_id = body.get("transactionId", "")
    redirect_url = body.get("redirectUrl", "")

    record("E2E step 1: Payment created", bool(txn_id), f"transactionId: {txn_id}")
    record("E2E step 2: Redirect URL returned", bool(redirect_url), f"URL: {redirect_url[:80]}")

    # Step 3: Verify transaction is pending
    if txn_id:
        verify_resp = http_req(f"{VERIFY_URL}?transactionId={txn_id}")
        if verify_resp["ok"]:
            status = verify_resp["body"].get("status", "")
            record("E2E step 3: Transaction is pending", status == "pending", f"status: {status}")
        else:
            record("E2E step 3: Transaction inquiry", False, f"HTTP {verify_resp['status']}")

    # Step 4: We CANNOT complete the payment automatically
    # (requires manual wallet interaction on ZainCash payment page)
    record("E2E step 4: Complete payment on ZainCash page", False,
           "CANNOT AUTOMATE: Requires manual wallet login (MSISDN + PIN + OTP) on ZainCash payment page",
           "ZAINCASH SANDBOX")

    # Step 5-10: Cannot be automated without completing step 4
    steps = [
        ("E2E step 5: Verify ZainCash sends callback", "Requires payment completion"),
        ("E2E step 6: Verify callback receives it", "Requires payment completion"),
        ("E2E step 7: Payment record becomes completed", "Requires payment completion"),
        ("E2E step 8: Subscription becomes active", "Requires payment completion"),
        ("E2E step 9: Failed payment does NOT activate", "Requires payment cancellation"),
        ("E2E step 10: Duplicate callback harmless", "Requires payment completion + replay"),
    ]
    for step, reason in steps:
        record(step, False, f"CANNOT AUTOMATE: {reason}", "ZAINCASH SANDBOX")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  ZainCash Integration — Phase 2 & 3 Comprehensive Tests   ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    # JWT payload verification (local, no network)
    test_jwt_payload_structure()

    # Vercel API tests
    txn_id, redirect_url, order_id = test_vercel_create_payment()
    test_vercel_verify(txn_id)

    # Callback endpoint tests
    test_callback_endpoint()
    test_callback_with_valid_data(txn_id)
    test_callback_idempotency(txn_id)
    test_callback_with_jwt_token(txn_id)

    # Client-side polling
    test_client_polling_fallback(txn_id)

    # End-to-end
    test_e2e_sandbox_flow()

    # ── Summary ──
    print("\n╔══════════════════════════════════════════════════════════════╗")
    print("║  Test Summary                                              ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    total = len(results)

    # Categorize failures
    categories = {}
    for r in results:
        if r["status"] == "FAIL" and r.get("category"):
            cat = r["category"]
            categories[cat] = categories.get(cat, 0) + 1

    print(f"\n  Total: {total}  |  Passed: {passed}  |  Failed: {failed}")

    if categories:
        print(f"\n  Failure categories:")
        for cat, count in sorted(categories.items()):
            print(f"    {cat}: {count}")

    our_code_failures = [r for r in results if r["status"] == "FAIL" and r.get("category") in ("OUR CODE", "")]
    if our_code_failures:
        print(f"\n  ⚠ Our code issues:")
        for r in our_code_failures:
            print(f"    ✗ {r['test']}: {r['detail'][:80]}")

    # Save results
    with open("/home/z/my-project/scripts/zaincash_comprehensive_results.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n  Results saved to zaincash_comprehensive_results.json")

    # Return 0 only if no our-code failures
    return 0 if not our_code_failures else 1


if __name__ == "__main__":
    sys.exit(main())
