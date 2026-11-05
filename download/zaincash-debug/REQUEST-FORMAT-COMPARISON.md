# ZainCash v1 API Request Format — Field-by-Field Comparison

**Date**: 2026-08-24
**Source of truth**: Laravel reference implementation at https://github.com/waadmawlood/zaincash (raw files fetched from `raw.githubusercontent.com`)
**Our integration**: `/home/z/my-project/artifacts/api-server/src/routes/zaincash.ts`

---

## CRITICAL DISCOVERY — Wrong MSISDN used as `phonenumber`

The Laravel README documents two distinct MSISDNs:

| Role | MSISDN | Used in |
|------|--------|---------|
| **Merchant wallet** (recipient) | `9647835077893` | JWT init payload (`msisdn` field), JWT check payload (`msisdn` field) |
| **Customer test wallet** (payer) | `9647802999569` | `/transaction/processing` (`phonenumber` field), `/transaction/processingOTP` (`phonenumber` field) |

The Laravel README shows the exact API calls:

```php
// Step 3 — Processing
$processingDetails = $zainCashPayment->processingTransaction("9647802999569", '1234');

// Step 4 — Pay (OTP)
$payDetails = $zainCashPayment->payTransaction("9647802999569", '1234', '1111');
```

Response example confirms the customer wallet is the `from` field, not the merchant wallet:

```json
{
  "to": { "msisdn": "9647835077893", "id": "5ffacf6612b5777c6d44266f" },
  "from": "9647802999569",
  ...
}
```

**Our bug**: We were sending the merchant MSISDN (`9647835077893`) as the `phonenumber` in `/transaction/processing` and `/transaction/processingOTP`. This produced "Wrong Credentials" because the merchant wallet is not the payer — the customer wallet is.

**Correct test credentials** (from Laravel README):
- Customer phonenumber: `9647802999569`
- Customer PIN: `1234`
- Customer OTP: `1111`

---

## Field-by-Field Comparison

### 1. POST /transaction/init (Create Transaction)

| Field | Laravel Reference | Our Code | Match? |
|-------|-------------------|----------|--------|
| URL | `{baseUrl}transaction/init` where `baseUrl = https://test.zaincash.iq/` (trailing slash) → `https://test.zaincash.iq/transaction/init` | `${config.baseUrl}/transaction/init` where `baseUrl = https://test.zaincash.iq` (NO trailing slash) → `https://test.zaincash.iq/transaction/init` | ✓ (URL resolves the same after concat) |
| Method | POST | POST | ✓ |
| Content-Type | `application/x-www-form-urlencoded` (via Laravel `Http::asForm()`) | `application/x-www-form-urlencoded` | ✓ |
| Body — `lang` | `'ar'` (default config) | `config.lang` = `'ar'` | ✓ |
| Body — `merchantId` | merchant ID (e.g., `5ffacf6612b5777c6d44266f`) | `config.merchantId` = `5ffacf6612b5777c6d44266f` | ✓ |
| Body — `token` | `urlencode($token)` — **URL-encoded JWT** | `token` (raw, NOT URL-encoded) | ⚠️ MISMATCH — but `URLSearchParams.append()` already URL-encodes the value, so the wire format is identical |
| JWT payload — `amount` | amount (int) | amount (int) | ✓ |
| JWT payload — `serviceType` | One of: `Book`, `Food`, `Grocery`, `Pharmacy`, `Transportation`, `Other` (per README) | `'subscription'` (INVALID — not in allowed list) | ❌ **BUG** — ZainCash may reject or default |
| JWT payload — `msisdn` | `9647835077893` (merchant wallet) | `config.msisdn` = `9647835077893` | ✓ |
| JWT payload — `orderId` | `wa3d_` + Str::random(36) (prefixed) | `tt-${planId}-${companyId}-${Date.now()}-${rand}` (NOT prefixed) | ⚠️ Order ID format differs but no validation rule violated |
| JWT payload — `redirectUrl` | Empty string `''` when `is_redirect=false` (default) | Full URL `https://track-tracker-app.vercel.app/api/zaincash/callback?orderId=...&planId=...&companyId=...` | ⚠️ Differs but ZainCash accepts both |
| JWT payload — `iat` | `time()` (current Unix timestamp) | `Math.floor(Date.now() / 1000)` | ✓ |
| JWT payload — `exp` | `time() + 60*60*4` (4 hours) | `now + 60*60*4` (4 hours) | ✓ |
| JWT signing | HMAC-SHA256, base64url-encoded (no `=` padding, `+`→`-`, `/`→`_`) | HMAC-SHA256, base64url-encoded (no `=`, `+`→`-`, `/`→`_`) | ✓ |

### 2. POST /transaction/get (Inquiry)

| Field | Laravel Reference | Our Code | Match? |
|-------|-------------------|----------|--------|
| URL | `{baseUrl}transaction/get` → `https://test.zaincash.iq/transaction/get` | `${config.baseUrl}/transaction/get` | ✓ |
| Method | POST | POST | ✓ |
| Content-Type | `application/x-www-form-urlencoded` | `application/x-www-form-urlencoded` | ✓ |
| Body — `merchantId` | merchant ID | `config.merchantId` | ✓ |
| Body — `token` | `urlencode($token)` (URL-encoded JWT) | `token` (URLSearchParams already URL-encodes) | ✓ |
| JWT payload — `id` | transaction ID | transaction ID | ✓ |
| JWT payload — `msisdn` | `9647835077893` (merchant wallet) | `config.msisdn` = `9647835077893` | ✓ |
| JWT payload — `iat`, `exp` | Same as init | Same | ✓ |

### 3. POST /transaction/processing (Process Transaction) — THE BUG IS HERE

| Field | Laravel Reference | Our Code (debug endpoint) | Match? |
|-------|-------------------|---------------------------|--------|
| URL | `{baseUrl}transaction/processing` → `https://test.zaincash.iq/transaction/processing` | `${config.baseUrl}/transaction/processing` | ✓ |
| Method | POST | POST | ✓ |
| Content-Type | `application/x-www-form-urlencoded` | `application/x-www-form-urlencoded` | ✓ |
| Body — `id` | transaction ID (24-char hex) | transaction ID | ✓ |
| Body — `phonenumber` | **`9647802999569`** (CUSTOMER wallet) | `config.msisdn` = `9647835077893` (MERCHANT wallet) | ❌ **BUG** |
| Body — `pin` | `'1234'` (test PIN) | Various guesses (none matched `1234`) | ❌ **BUG** |
| Body — NO token | Laravel sends NO `token`, NO `merchantId` | Our endpoint should also send NO token | ✓ (need to verify) |

Validation rules (from `ValidationProcessing.php`):
- `id`: required, must be **hexadecimal** (24-char MongoDB ObjectId format)
- `phonenumber`: required, must match `/^[0-9]{13}$/` (exactly 13 digits)
- `pin`: required, string, max 254 chars

### 4. POST /transaction/processingOTP?type=MERCHANT_PAYMENT (Pay Transaction)

| Field | Laravel Reference | Our Code (debug endpoint) | Match? |
|-------|-------------------|---------------------------|--------|
| URL | `{baseUrl}transaction/processingOTP?type=MERCHANT_PAYMENT` | `${config.baseUrl}/transaction/processingOTP?type=MERCHANT_PAYMENT` | ✓ |
| Method | POST | POST | ✓ |
| Content-Type | `application/x-www-form-urlencoded` | `application/x-www-form-urlencoded` | ✓ |
| Body — `id` | transaction ID | transaction ID | ✓ |
| Body — `phonenumber` | **`9647802999569`** (CUSTOMER wallet) | `config.msisdn` = `9647835077893` (MERCHANT wallet) | ❌ **BUG** |
| Body — `pin` | `'1234'` | Wrong | ❌ **BUG** |
| Body — `otp` | `'1111'` (test OTP) | Wrong | ❌ **BUG** |
| Body — NO token | No `token`, no `merchantId` | (should also send none) | ✓ |

### 5. POST /transaction/cancel (Cancel Transaction)

Laravel reference (we don't currently use this):
```php
data: [
    'id' => $this->getTransactionID(),
    'type' => 'MERCHANT_PAYMENT'
]
```
URL: `{baseUrl}transaction/cancel`

---

## Summary of Bugs to Fix

| # | Bug | Fix |
|---|-----|-----|
| 1 | `phonenumber` in `/transaction/processing` uses merchant MSISDN instead of customer MSISDN | Hardcode `9647802999569` (or env var `ZAINCASH_TEST_CUSTOMER_MSISDN`) |
| 2 | `pin` not set to `1234` | Hardcode `1234` (or env var `ZAINCASH_TEST_PIN`) |
| 3 | `otp` not set to `1111` | Hardcode `1111` (or env var `ZAINCASH_TEST_OTP`) |
| 4 | `serviceType: 'subscription'` not in Laravel's allowed list | Change to `'Other'` |
| 5 | Unresolved git merge conflict markers in `zaincash.ts` lines 601, 696, 700 — blocks TypeScript compilation | Resolve by keeping `processCallback` approach |
| 6 | `processCallback` uses direct PostgREST PATCH on `payment_records` (RLS blocks UPDATE) | Use `update_payment_record` RPC (SECURITY DEFINER bypasses RLS) |
| 7 | `processCallback` uses direct PostgREST GET on `payment_records` for idempotency (RLS may block some access patterns) | Use `get_payment_record` RPC |
| 8 | `processCallback` filters `companies?id=eq.${companyId}` but `companyId` is the company NAME (text), not UUID | Filter by `name` (URL-encoded), then verify |

## Test Wallets from Laravel README

The Laravel README only documents ONE pair of test wallets:

```
Merchant (recipient): 9647835077893  (with merchant_id 5ffacf6612b5777c6d44266f)
Customer (payer):     9647802999569  (with PIN 1234, OTP 1111)
```

Any other MSISDN used in previous tests was a guess and not from the official Laravel docs.

## Conclusion

The "Wrong Credentials" error from ZainCash was caused by **sending the wrong MSISDN as `phonenumber`** in the processing and pay endpoints. The merchant wallet MSISDN was incorrectly used instead of the customer test wallet MSISDN documented in the Laravel README.

After fixing this single bug (plus the merge conflict, RLS-bypass RPCs, and company ID filter), the ZainCash UAT payment flow should succeed end-to-end.
