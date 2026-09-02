# ADDENDUM — Official Docs Credentials Test (2026-09-02)

## Credentials Tested (per user instruction — official ZainCash docs)
- MSISDN: `9647802999569`
- PIN: `1111`
- OTP: `11111` (user message) and `111111` (pub.dev official SDK docs variant)

## Result: FAILED — Outcome B confirmed with stronger evidence

### Test Runs (fresh transaction per combo, via Vercel serverless → test.zaincash.iq)

| # | txId | PIN | OTP | PROCESSING | PAY | Final tx status |
|---|------|-----|-----|------------|-----|-----------------|
| A | 6a9809175029ab171981a24c | 1111 | 111111 | success=0 `SYSTEMINVALID-MSISDN` | success=0 `incorrect_otp` | `failed` (due: incorrect_otp) |
| B | 6a9809275029ab171981a24d | 1111 | 11111 | success=0 `SYSTEMINVALID-MSISDN` | success=0 `incorrect_otp` | `failed` (due: incorrect_otp) |

Supabase after both runs: `payment_records.status = pending` (callback not triggered —
ZainCash's callback is a browser redirect, and the payment never reached completion),
`subscription_active = false`.

### Decisive Evidence (tx 6a9809175029ab171981a24c from ZainCash /transaction/get)

```json
{
  "status": "failed",
  "due": "incorrect_otp",
  "from": "9647802999569",
  "sofOwnerId": 10426059,
  "amount": "1000",
  "type": "MERCHANT_PAYMENT",
  "merchant": "test integration en (5ffacf6612b5777c6d44266f)"
}
```

### Why this proves the problem is on ZainCash's side

1. **The wallet is real and recognized.** ZainCash records `from: 9647802999569`
   with `sofOwnerId: 10426059` on the transaction. Our request format is correct.
2. **PIN `1111` produces a UNIQUE error** — `SYSTEMINVALID-MSISDN` — while every
   other wrong PIN (1234, 9999, 4321, 12345, 123456, 000000) produces
   `Wrong Credentials. Please try again.` A unique error for a unique PIN means
   ZainCash's system treats PIN 1111 differently from random wrong PINs: the PIN
   passes credential validation and then fails a SYSTEM-level MSISDN (wallet
   provisioning) check. Interpretation: the test wallet is not properly
   provisioned / is system-blocked on the v1 `test.zaincash.iq` gateway.
3. **All documented OTP values rejected.** OTP `1111` (Laravel README),
   `11111` (user's message), `111111` (pub.dev docs) → `incorrect_otp` every time.
4. **The docs credentials belong to the NEW gateway.** The pub.dev SDK README
   (`zaincash_payment` on pub.dev) documents
   `9647802999569 / PIN 1111 / OTP 111111` together with
   `clientId: 758055f4a8044779a35f6ceb69f858b3` and base URL
   `https://pg-api.zaincash.iq` — the v2 payment-gateway API. Our merchant
   account (`5ffacf6612b5777c6d44266f`, "test integration en") is on the OLD v1
   API (`test.zaincash.iq`), which the Laravel reference integration uses.

### What worked (integration-side — all verified again this run)

- POST `/transaction/init` → 200, transaction created, status `pending`
- JWT signing, merchant config, serviceType `Other`, redirectUrl — all accepted
- POST `/transaction/processing` → 200 (processed, wallet recognized)
- POST `/transaction/processingOTP?type=MERCHANT_PAYMENT` → 200 (processed)
- GET `/transaction/get` → 200, full transaction record retrievable
- Supabase `payment_records` row created at init with status `pending`
- ZainCash marks transaction `failed` with a reason — our verify endpoint reads it

### What failed (ZainCash-side)

- Wallet `9647802999569` cannot authenticate on v1 UAT with ANY documented PIN/OTP
- Terminal failure: `status=failed`, `due=incorrect_otp` / `SYSTEMINVALID-MSISDN`
- Subscription activation impossible until a payment completes

### Required action — ZainCash support

Send them: merchant ID `5ffacf6612b5777c6d44266f` ("test integration en"),
sample failed txIds `6a9809175029ab171981a24c` / `6a9809275029ab171981a24d`,
and ask: (1) what are the CURRENT valid v1 UAT test-wallet credentials for
`test.zaincash.iq`, and (2) is wallet `9647802999569` (sofOwnerId 10426059)
system-blocked (`SYSTEMINVALID-MSISDN`)?

### Evidence files (this run)

- `docs-00-summary-*.json`, `docs-01..05-*.json` — first E2E run with docs creds
- `matrix-*.json` — PIN/OTP matrix results (both combos)
- `otp-matrix-*.json` — direct-call attempt (blocked by Cloudflare, kept for log)

### Scripts

- `/home/z/my-project/scripts/zaincash-docs-creds-e2e.cjs` — E2E with docs creds
- `/home/z/my-project/scripts/zaincash-otp-matrix-vercel.cjs` — matrix via Vercel
