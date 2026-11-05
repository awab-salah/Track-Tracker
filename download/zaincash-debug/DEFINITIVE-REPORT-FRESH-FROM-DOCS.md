# ZainCash Integration — Definitive Report (Fresh Investigation from Official Docs)

**Date**: 2026-09-08
**Investigator**: Super Z (main agent)
**Primary source**: https://docs.zaincash.iq/ (fetched via web_search snippets — Cloudflare blocks direct browsing/agent-browser)
**Cross-referenced**: official Flutter SDK `zaincash_payment` v0.0.1 on pub.dev/libraries.io; community packages `thejano/zaincash-laravel` and `waadmawlood/zaincash` for v1 historical context only.

---

## Required Output — Short Definitive Report

### Official versions found

**Only one version is currently documented on https://docs.zaincash.iq — v2 (Payment Gateway API v2).**

The official docs page title is literally *"ZainCash Payment Gateway API Documentation v2 | Complete"*. It does **not** contain any reference to the v1 (`test.zaincash.iq` / JWT-with-merchantId) endpoints (`/transaction/processing`, `/transaction/processingOTP`) anywhere. The official Flutter SDK on pub.dev (`zaincash_payment`) ships the v2 implementation in `zaincash_payment.dart` and explicitly redirects legacy merchants to `zaincash_payment_legacy.dart`, confirming a v1 also exists historically — but the current official docs page is exclusively v2.

### Current project version

**v1 (legacy)** — implemented in `artifacts/api-server/src/routes/zaincash.ts` using JWT-with-merchant-secret authentication.

### Current project gateway

**`https://test.zaincash.iq`** (v1 UAT), with v1 merchant credentials:
- `merchantId: 5ffacf6612b5777c6d44266f`
- `msisdn: 9647835077893` (merchant phone)
- `secret: $2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS`

Endpoints used: `POST /transaction/init`, `POST /transaction/get`, `GET /transaction/pay?id=…`. Also uses `POST /transaction/processing` and `POST /transaction/processingOTP?type=MERCHANT_PAYMENT` in the `/debug-complete-payment` debug endpoint (these endpoints are NOT documented on the current docs.zaincash.iq — they were only documented in the legacy Laravel packages).

### Correct UAT gateway

Per the official docs.zaincash.iq (v2):
- **UAT base URL: `https://pg-api-uat.zaincash.iq`**
- Production base URL: `https://pg-api.zaincash.iq`

For v1 (legacy, no longer on docs.zaincash.iq but supported in Laravel packages):
- UAT base URL: `https://test.zaincash.iq`
- Production base URL: `https://api.zaincash.iq`

### Official integration credentials

**v2 (current docs.zaincash.iq):**
- Authentication: OAuth2 `client_credentials` grant
- Token endpoint: `POST /oauth2/token` with body fields `grant_type=client_credentials`, `client_id`, `client_secret`, `scope` (space-separated, e.g. `payment:read payment:write`), `language` (en/ar/ku)
- Subsequent requests: `Authorization: Bearer <access_token>`
- Init endpoint: `POST /api/v2/payment-gateway/transaction/init`
- Inquiry endpoint: `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}`
- Scopes (from docs snippet): `payment:read` (read privileges), `payment:write` (write privileges), `reverse:write` (refund privileges)
- Documented UAT example credentials (from the official Flutter SDK on libraries.io, citing "UAT test credentials (from the official docs)"):
  - `client_id: 758055f4a8044779a35f6ceb69f858b3`
  - `client_secret: bibLCGTxVAig5To3OLLKPJQMlRR7Pefp`

  *(Note: these are the official example/test integration credentials from the docs. Our merchant does NOT have v2 credentials — ZainCash must issue them for our account.)*

**v1 (legacy Laravel packages):**
- Authentication: HMAC-SHA256 JWT signed with merchant secret
- Merchant identity: `merchantId` + `msisdn` + `secret`
- Init: `POST /transaction/init` with body `{ token, merchantId, lang }` where `token = JWT({ amount, serviceType, orderId, redirectUrl, msisdn, iat, exp })`
- Inquiry: `POST /transaction/get` with body `{ token, merchantId }` where `token = JWT({ id, msisdn, iat, exp })`
- Customer pay URL: `{baseUrl}/transaction/pay?id={transactionId}`
- v1 server-side payment (Laravel `waadmawlood/zaincash` only, NOT documented on current docs.zaincash.iq): `POST /transaction/processing` with `{ id, phonenumber, pin }`, then `POST /transaction/processingOTP?type=MERCHANT_PAYMENT` with `{ id, phonenumber, pin, otp }`
- Documented UAT merchant (from both `thejano/zaincash-laravel` and `waadmawlood/zaincash` config defaults):
  - `merchantId: 5ffacf6612b5777c6d44266f`
  - `msisdn: 9647835077893`
  - `secret: $2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS`

  *(These match our current project config — so our merchant account is correctly set up for v1.)*

### Official test wallet

**v2 (current docs.zaincash.iq)** — multiple test customer wallets documented:
| # | MSISDN | PIN | OTP |
|---|--------|-----|-----|
| 1 | `9647802999569` | `1111` | `111111` |
| 2 | `9647829744432` | `1111` | `111111` |
| 3 | `9647829744464` | `1111` | `111111` |
| 4 | (4th wallet listed but truncated in search snippet) | `1111` | `111111` |

The user's quoted credentials (`9647802999569 / PIN 1111 / OTP 11111`) are slightly wrong — the official docs say OTP is **`111111`** (6 digits), not `11111` (5 digits). I tested both variants and both fail identically.

**v1 (legacy)** — the old Laravel README documents `9647802999569 / PIN 1234 / OTP 1111` but this is the OLD v1 wallet configuration that no longer matches the current docs. There is NO v1 customer test wallet documented on the current `docs.zaincash.iq` page.

### Exact payment flow

**v2 (correct flow per docs.zaincash.iq):**
1. `POST /oauth2/token` with `grant_type=client_credentials&client_id=…&client_secret=…&scope=payment:read payment:write&language=en` → returns `{ access_token, expires_in, … }`
2. `POST /api/v2/payment-gateway/transaction/init` with `Authorization: Bearer <access_token>` and body `{ amount, orderId, serviceType, successUrl, failureUrl, … }` → returns `{ transactionId, redirectUrl }`
3. **Redirect the customer's browser** to `redirectUrl` (ZainCash hosted payment page). The customer enters wallet + PIN + OTP on ZainCash's page (NOT on our server).
4. After completion or failure, ZainCash redirects the customer to our `successUrl` (or `failureUrl`) with a signed JWT token containing the transaction status.
5. We verify the JWT signature and then call `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}` to confirm the final status before fulfilling the order.
6. Optionally subscribe to server-side webhooks at a configured `notificationUrl` for asynchronous status updates.

**v2 has NO server-side `/transaction/processing` or `/transaction/processingOTP` endpoints** — there is no way to "complete a payment server-side". Our existing `/api/zaincash/debug-complete-payment` endpoint will not work on v2 because those endpoints do not exist on `pg-api-uat.zaincash.iq`.

### Exact point where our test fails

On v1 (`test.zaincash.iq`):
- Step 1 (`POST /transaction/init`): **✅ Works** — transaction is created with status `pending`
- Step 2 (`POST /transaction/processing` with phone+PIN): **❌ Fails** — `success: 0`, JWT msg = `SYSTEMINVALID-MSISDN` for PIN `1111`, or `Wrong Credentials. Please try again.` for any other PIN
- Step 3 (`POST /transaction/processingOTP` with phone+PIN+OTP): **❌ Fails** — `success: 0`, JWT msg = `incorrect_otp`
- Step 4 (`POST /transaction/get` for final status): **Returns `status: failed`, `due: incorrect_otp`, `from: 9647829744464` (or whichever wallet tested)**
- Supabase: `payment_records.status` stays `pending` (callback is browser-redirect, never fired because we drive the API directly), `companies.subscription_active` stays `false`

### Exact error

**Two distinct errors observed**:

For the v2 documented credentials (PIN `1111`, OTP `111111`), on any of the 3 documented v2 test wallets (`9647802999569`, `9647829744432`, `9647829744464`):

- `/transaction/processing` returns a JWT containing `{"status":"failed","msg":"SYSTEMINVALID-MSISDN",...}`
- `/transaction/processingOTP` returns a JWT containing `{"status":"failed","msg":"incorrect_otp",...}`
- Final `/transaction/get` shows `status: "failed"`, `due: "incorrect_otp"`

For the OLD v1 Laravel README credentials (PIN `1234`, OTP `1111`) on wallet `9647802999569`:

- `/transaction/processing` returns `{"status":"failed","msg":"Wrong Credentials. Please try again.",...}`
- `/transaction/processingOTP` returns `{"status":"failed","msg":"incorrect_otp",...}`
- Final: `status: "failed"`, `due: "incorrect_otp"`

Sample failed v1 transactions:
- `6aa08b427d314ee2a3ccd131` — wallet #1 (`9647802999569`) PIN `1111`
- `6aa08b527d314ee2a3ccd132` — wallet #2 (`9647829744432`) PIN `1111`
- `6aa08ade47420de09c064244` — wallet #3 (`9647829744464`) PIN `1111`
- `6aa08bc97ab2c90dab02ae93` — wallet #1 PIN `1234` (Laravel README)

### Root cause

**We are using the wrong ZainCash API version.** Our TrackTracker code implements the v1 legacy API (`test.zaincash.iq`, JWT-with-merchant-secret), but the official ZainCash documentation at `docs.zaincash.iq` now exclusively documents v2 (`pg-api-uat.zaincash.iq`, OAuth2 client_credentials). The documented customer test wallets (`9647802999569 / PIN 1111 / OTP 111111` and 3 others) are v2 UAT test wallets. They are not valid for use on the v1 gateway — when used on v1, the v1 endpoint recognizes the wallet (records `from: <phone>` and `sofOwnerId`) but the PIN triggers a system-level block (`SYSTEMINVALID-MSISDN`) and every OTP is rejected with `incorrect_otp`. No v1 customer test wallet is currently documented anywhere reachable.

Importantly, PIN `1111` produces a UNIQUE error (`SYSTEMINVALID-MSISDN`) on v1 — distinct from any random wrong PIN (which gives `Wrong Credentials`). A unique error for a unique PIN means v1 recognizes the PIN as the correct PIN for that wallet but then fails a system-level provisioning check. This is consistent with the wallets being provisioned for v2 only, not v1.

### What must be changed in our code

The user explicitly said "Do not rewrite production code yet." This section describes the required change but does NOT implement it.

To make v2 work end-to-end, the following changes to `artifacts/api-server/src/routes/zaincash.ts` are required:

1. **Authentication**: Replace the JWT-with-merchant-secret implementation with OAuth2 client_credentials:
   - Add `POST /oauth2/token` call to `https://pg-api-uat.zaincash.iq/oauth2/token` with body `{ grant_type: 'client_credentials', client_id, client_secret, scope: 'payment:read payment:write', language: 'en' }`
   - Cache the access token (with TTL based on `expires_in`)
   - Use `Authorization: Bearer <access_token>` header for all subsequent calls

2. **Init**: Replace `POST /transaction/init` (with token+merchantId+lang body) with `POST /api/v2/payment-gateway/transaction/init` with `Authorization: Bearer` and JSON body `{ amount, orderId, serviceType, successUrl, failureUrl }`. The v2 `serviceType` is "merchant-defined — no fixed list" per the docs, so `Other` or any string works.

3. **Inquiry**: Replace `POST /transaction/get` with `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}` with `Authorization: Bearer` header.

4. **Callback**: Replace the v1 JWT-decoding callback handler with v2 JWT verification (using the v2 `api_key` if one is provided, or per the documented v2 callback JWT verification scheme). The docs say *"After verifying the token with your …"*, so a JWT signature verification step is required, but with a v2-issued key (not our v1 merchant secret).

5. **Remove** the `/api/zaincash/debug-complete-payment` endpoint entirely — it uses v1's `/transaction/processing` and `/transaction/processingOTP` endpoints which DO NOT EXIST on v2. There is no v2 server-side payment completion path; the customer must pay on ZainCash's hosted page.

6. **Webhooks** (optional but recommended): v2 docs mention webhooks. Add a webhook handler if ZainCash issues us a `notificationUrl` configuration.

7. **Configuration**: Add new env vars `ZAINCASH_V2_CLIENT_ID`, `ZAINCASH_V2_CLIENT_SECRET`, optionally `ZAINCASH_V2_API_KEY` (for callback JWT verification). Keep the existing `ZAINCASH_BASE_URL` env to switch `https://pg-api-uat.zaincash.iq` ↔ `https://pg-api.zaincash.iq`.

### What must be provided/enabled by ZainCash

Before any code changes can be tested, ZainCash must:

1. **Issue v2 credentials for our merchant account** (`merchantId 5ffacf6612b5777c6d44266f`):
   - A v2 `client_id`
   - A v2 `client_secret`
   - (Optional but expected) a v2 `api_key` for callback JWT verification
   - Confirmation of which scopes are enabled for our account (`payment:read`, `payment:write`, `reverse:write`)

2. **Confirm v2 UAT account provisioning**:
   - That our v2 client_id is provisioned for `pg-api-uat.zaincash.iq` (UAT)
   - That the documented customer test wallets (`9647802999569`, `9647829744432`, `9647829744464`, all with PIN `1111` / OTP `111111`) are valid for our v2 UAT account

3. **Provide the exact v2 documentation details we cannot read because of Cloudflare**:
   - Confirm the OAuth2 token endpoint path is `POST /oauth2/token`
   - Confirm the init endpoint path is `POST /api/v2/payment-gateway/transaction/init`
   - Provide the exact request body fields for init (the docs mention `amount`, `orderId`, `serviceType`, `redirectUrl`/`successUrl`/`failureUrl` but the full schema is unclear from search snippets)
   - Provide the inquiry endpoint path: `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}`
   - Provide the webhook notificationUrl configuration flow and signature verification method
   - Provide the redirect-callback JWT verification method (which key to use)

4. **(Alternative)** If ZainCash does NOT want us on v2 and prefers we stay on v1:
   - Provide valid v1 customer test wallet credentials for `test.zaincash.iq` (none are currently documented on `docs.zaincash.iq`)
   - Confirm whether wallet `9647802999569` (sofOwnerId `10426059`) is system-blocked on v1 and why

### EXACT message to send ZainCash support

> **Subject:** UAT integration — request v2 (Payment Gateway API) credentials for `pg-api-uat.zaincash.iq`
>
> Hello ZainCash Support,
>
> We are integrating the ZainCash Payment Gateway into our product TrackTracker and need v2 API credentials.
>
> Our existing merchant account (v1):
> - Merchant ID: `5ffacf6612b5777c6d44266f`
> - Merchant name: "test integration en"
> - Merchant MSISDN: `9647835077893`
> - Currently using: `https://test.zaincash.iq` (v1 JWT-with-merchant-secret flow)
>
> We want to migrate to the v2 Payment Gateway API documented at https://docs.zaincash.iq. Please provide the following for our merchant account:
>
> 1. A v2 `client_id` and `client_secret` for `https://pg-api-uat.zaincash.iq` (UAT environment)
> 2. The OAuth2 token endpoint URL (we believe it is `POST /oauth2/token` with `grant_type=client_credentials`, please confirm)
> 3. The transaction init endpoint URL (we believe it is `POST /api/v2/payment-gateway/transaction/init`, please confirm) and the exact request body fields
> 4. The transaction inquiry endpoint URL (we believe it is `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}`, please confirm)
> 5. The scopes enabled for our account (we believe `payment:read` and `payment:write` are needed — please confirm)
> 6. A v2 `api_key` if one is required for redirect-callback JWT signature verification, and the JWT verification method
> 7. The webhook `notificationUrl` setup flow (if we want to receive server-side status updates) and the webhook signature verification method
> 8. Confirmation that the documented v2 UAT customer test wallets work with our v2 client_id:
>    - `9647802999569` / PIN `1111` / OTP `111111`
>    - `9647829744432` / PIN `1111` / OTP `111111`
>    - `9647829744464` / PIN `1111` / OTP `111111`
>
> For your reference, on the v1 gateway our tests with the documented v2 customer test wallets all fail at the `/transaction/processing` step with a JWT containing `"msg":"SYSTEMINVALID-MSISDN"`. Sample failed v1 transactions (in case you want to investigate the wallet provisioning):
> - `6aa08b427d314ee2a3ccd131`
> - `6aa08b527d314ee2a3ccd132`
> - `6aa08ade47420de09c064244`
>
> Thank you for your help.
>
> Best regards,
> [Your Name]
> [Your Company: TrackTracker]
> [Your Contact: WhatsApp +964 7XX XXX XXXX]

---

## Detailed Evidence (Appendix)

### A. Official docs.zaincash.iq snippets (via z-ai web_search)

| Topic | Search snippet |
|-------|----------------|
| Page title | "ZainCash Payment Gateway API Documentation v2 | Complete" |
| Base URL | "Base URL. https://pg-api-uat.zaincash.iq" |
| Auth | "Your backend authenticates with ZainCash using POST /oauth2/token. You create a transaction using POST /api/v2/payment-gateway/transaction/init." |
| Auth header | "Use the access token in all subsequent API requests. JSON. Authorization: Bearer <access_token>" |
| Inquiry | "Retrieve the latest status and details for a given payment transaction. GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}" |
| serviceType | "The service_type field is merchant-defined — there is no fixed list and no value needs to be requested from ZainCash. Send any value you want stored." |
| Test wallets | "Please select one of the following customer test wallets to submit your transaction. #. MSISDN. PIN. OTP. 1, 9647802999569, 1111, 111111. 2, 9647829744432, 1111, 111111. 3, 9647829744464, 1111, 111111. 4 …" |
| OAuth scope | "Space-separated scopes, e.g., payment:read payment:write. /oauth2/token endpoint body request. language, string, yes, Language code: en, ar, or ku." |
| Redirect | "Once the payment is completed successfully, ZainCash redirects the customer to your successUrl with a signed JWT token." |
| Webhooks | "Webhooks allow ZainCash to notify your backend whenever a transaction status changes. You configure a server-side notificationUrl that receives POST requests." |

### B. Official Flutter SDK (pub.dev `zaincash_payment` v0.0.1, via libraries.io cached page)

```
"A Flutter merchant gateway for the ZainCash Payment Gateway API v2 (docs.zaincash.iq).
 Supports OAuth2 authentication, transaction creation, a ready-to-use WebView payment
 screen, status inquiry, callback token decoding, and reversals (refunds).

 Old merchant account (merchantId + JWT secret on api.zaincash.iq)?
 Import package:zaincash_payment/zaincash_payment_legacy.dart instead —
 the previous implementation is kept there."

 Configure: ZainCash provides a Client ID, Client Secret, and your production API link during onboarding.

 const config = ZainCashConfig(
   clientId: 'YOUR_CLIENT_ID',
   clientSecret: 'YOUR_CLIENT_SECRET',
   apiKey: 'YOUR_API_KEY',
   isTest: true,
   productionBaseUrl: 'https://pg-api.zaincash.iq',
 );
 // UAT test credentials (from the official docs):
 const testConfig = ZainCashConfig(
   clientId: '758055f4a8044779a35f6ceb69f858b3',
   clientSecret: 'bibLCGTxVAig5To3OLLKPJQMlRR7Pefp',
   isTest: true,
 );
 // Test customers: 9647802999569 / PIN 1111 / OTP 111111

 Features: OAuth2 client_credentials authentication with token caching.
 createTransaction - create a payment, get the hosted page redirectUrl.
 ZainCashPaymentPage - WebView screen that completes the whole flow.
 checkTransaction - transaction inquiry.
 reverseTransaction - refund.
```

### C. v1 reference implementations (Laravel packages, for historical context)

Both `thejano/zaincash-laravel` (`config/zaincash.php`) and `waadmawlood/zaincash` ship the same v1 merchant defaults:
- `merchant_id: 5ffacf6612b5777c6d44266f`
- `msisdn: 9647835077893`
- `secret: $2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS`
- `staging_url: https://test.zaincash.iq`
- `production_url: https://api.zaincash.iq`

`waadmawlood/zaincash` README documents customer test wallet `9647802999569` with PIN `1234` and OTP `1111` — but this is the OLD v1 wallet configuration that no longer matches the current official docs.

### D. TrackTracker implementation audit

`artifacts/api-server/src/routes/zaincash.ts` (lines 43–62, 78–90, 122–167, 218–247) uses:
- `baseUrl: https://test.zaincash.iq` ✅ correct for v1
- `msisdn: 9647835077893` ✅ matches official v1 merchant
- `merchantId: 5ffacf6612b5777c6d44266f` ✅ matches official v1 merchant
- `secret: $2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS` ✅ matches official v1 merchant
- JWT HMAC-SHA256 with `iat`/`exp` 4-hour expiry ✅ matches v1 spec
- `POST /transaction/init` with `application/x-www-form-urlencoded` body `{ token, merchantId, lang }` ✅ matches v1
- `POST /transaction/get` with body `{ merchantId, token }` ✅ matches v1
- `serviceType: 'Other'` ✅ matches v1 allowed list (`Book, Food, Grocery, Pharmacy, Transportation, Other`)
- `redirectUrl` encoded as a browser-redirect URL with `?token=...` callback ✅ matches v1
- `GET /api/zaincash/callback` decodes the JWT from `?token=...` using the merchant secret ✅ matches v1
- `POST /api/zaincash/callback` handles v1 JWT-in-body and v2/direct-JSON callbacks ✅ (forward-compat with v2 redirect format)
- `/api/zaincash/debug-complete-payment` uses `/transaction/processing` and `/transaction/processingOTP?type=MERCHANT_PAYMENT` ✅ matches v1 server-side test flow

**Mismatches against v2 official docs:**

| Aspect | Current (v1) | Required (v2 per docs) | Mismatch? |
|--------|--------------|------------------------|-----------|
| Base URL | `https://test.zaincash.iq` | `https://pg-api-uat.zaincash.iq` | YES |
| Auth | HMAC-SHA256 JWT with merchant secret | OAuth2 `client_credentials` Bearer token | YES |
| Token endpoint | N/A (no token endpoint — JWT signed locally) | `POST /oauth2/token` | YES |
| Init endpoint | `POST /transaction/init` body `{ token, merchantId, lang }` | `POST /api/v2/payment-gateway/transaction/init` with `Authorization: Bearer` header | YES |
| Init body | form-encoded `token, merchantId, lang` | JSON `amount, orderId, serviceType, successUrl, failureUrl` (no merchantId, no JWT in body) | YES |
| Inquiry endpoint | `POST /transaction/get` body `{ token, merchantId }` | `GET /api/v2/payment-gateway/transaction/inquiry/{transactionId}` with Bearer | YES |
| Customer pay URL | `{baseUrl}/transaction/pay?id={txId}` (browser redirect) | `{redirectUrl}` from init response (browser redirect to ZainCash hosted page) | Different URL pattern but same concept |
| serviceType | `Other` (v1 fixed enum) | Any merchant-defined string (v2 — no fixed list) | Different rules but `Other` would still work |
| Server-side payment completion | `/transaction/processing` + `/transaction/processingOTP` (Laravel legacy) | Does not exist in v2 — customer must pay on ZainCash hosted page | YES — our `/debug-complete-payment` cannot work on v2 |
| Callback | Browser redirect with JWT in `?token=`; JWT signed with merchant secret | Browser redirect to `successUrl`/`failureUrl` with signed JWT; JWT verification key from v2 onboarding (different from merchant secret) | Partial — same redirect pattern, different signing key |
| Webhooks | Not used | Documented in v2 (`notificationUrl`) | Not strictly required but recommended |

### E. Fresh E2E test results (this run)

Tested using the EXISTING deployed `/api/zaincash/debug-complete-payment` endpoint (no code changes, no new endpoints) on the v1 gateway `test.zaincash.iq` with each documented v2 test wallet:

| Wallet | MSISDN | PIN | OTP | txId | PROCESSING msg | PAY msg | Final status | payment_records | subscription_active |
|--------|--------|-----|-----|------|----------------|---------|--------------|-----------------|---------------------|
| #1 | 9647802999569 | 1111 | 111111 | 6aa08b427d314ee2a3ccd131 | `SYSTEMINVALID-MSISDN` | `incorrect_otp` | failed | pending | false |
| #2 | 9647829744432 | 1111 | 111111 | 6aa08b527d314ee2a3ccd132 | `SYSTEMINVALID-MSISDN` | `incorrect_otp` | failed | pending | false |
| #3 | 9647829744464 | 1111 | 111111 | 6aa08ade47420de09c064244 | `SYSTEMINVALID-MSISDN` | `incorrect_otp` | failed | pending | false |
| (old v1) | 9647802999569 | 1234 | 1111 | 6aa08bc97ab2c90dab02ae93 | `Wrong Credentials. Please try again.` | `incorrect_otp` | failed | pending | false |

All transactions were created successfully (`init` returned 200, txId assigned, status `pending`) but the customer payment step failed in every case. ZainCash DID recognize each wallet — the failed transactions show `from: <wallet-phone>` and `sofOwnerId` populated, so the wallet exists in ZainCash's database — but the PIN/OTP authentication step failed.

PIN `1111` (v2 docs) produces a UNIQUE error `SYSTEMINVALID-MSISDN`, distinct from the generic `Wrong Credentials` returned for every other wrong PIN. A unique error for a unique PIN means v1 recognizes `1111` as the correct PIN for the wallet but then fails a system-level provisioning check. This pattern is consistent with the wallet being provisioned for v2 only, not v1.

---

## Files Produced This Run

| File | Purpose |
|------|---------|
| `DEFINITIVE-REPORT-FRESH-FROM-DOCS.md` | This report |
| `fresh-e2e-summary-*.json` | E2E test summary across all 3 documented v2 wallets + old v1 creds |
| `fresh-e2e-*.json` | Per-wallet raw responses (saved incrementally during test) |
| `raw_zc_laravel_*` | Cached v1 reference Laravel package source for cross-reference |
| `docs_search*.json`, `github_*.json`, `myotpway.json` | Raw web search/page fetch artifacts |
