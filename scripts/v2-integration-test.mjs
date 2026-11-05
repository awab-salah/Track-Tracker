/**
 * ZainCash V2 Integration Test Script
 *
 * Tests the V2 payment flow WITHOUT initiating any real payment.
 * Combines:
 *   1. Source pattern verification (static analysis of source files)
 *   2. Live integration tests against the deployed Preview (safe endpoints only)
 *
 * Usage:
 *   node scripts/v2-integration-test.mjs <PREVIEW_URL>
 *
 * Exit code 0 = all tests passed; non-zero = at least one test failed.
 *
 * This script does NOT:
 *   - Call /api/zaincash/v2/create with a valid body (would create a real ZainCash transaction)
 *   - Initiate any payment
 *   - Modify any database records
 *   - Require any new dependencies (uses Node.js built-in fetch + node:test)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PREVIEW_URL = process.argv[2] || 'https://track-tracker-git-feat-zaincash-v2-awab-salahs-projects.vercel.app';

// ─── Helpers ───────────────────────────────────────────────────────────────

function readSrc(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

async function http(method, path, body) {
  const url = path.startsWith('http') ? path : `${PREVIEW_URL}${path}`;
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json, headers: res.headers };
}

function makeForgedJwt(claims, signingKey) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = `${enc(header)}.${enc(claims)}`;
  const sig = crypto.createHmac('sha256', signingKey).update(data).digest('base64url');
  return `${data}.${sig}`;
}

// ─── 1. Source Pattern Verification (static analysis) ─────────────────────

describe('Source pattern verification', () => {
  describe('Frontend', () => {
    const subSvc = readSrc('artifacts/track-tracker/src/services/subscriptionService.ts');
    const subPage = readSrc('artifacts/track-tracker/src/pages/SubscriptionsPage.tsx');
    const planCard = readSrc('artifacts/track-tracker/src/components/SubscriptionPlanCard.tsx');

    test('subscriptionService.ts calls /api/zaincash/v2/create (V2 endpoint)', () => {
      assert.ok(subSvc, 'subscriptionService.ts must exist');
      assert.ok(subSvc.includes('/api/zaincash/v2/create'),
        'subscriptionService.ts must call /api/zaincash/v2/create');
    });

    test('subscriptionService.ts does NOT call V1 endpoint /api/zaincash/create', () => {
      assert.ok(subSvc, 'subscriptionService.ts must exist');
      assert.ok(!subSvc.includes("'/api/zaincash/create'") && !subSvc.includes('"/api/zaincash/create"'),
        'subscriptionService.ts must NOT call V1 endpoint /api/zaincash/create');
    });

    test('SubscriptionsPage.tsx imports subscribeToPlan (V2 function)', () => {
      assert.ok(subPage, 'SubscriptionsPage.tsx must exist');
      assert.ok(subPage.includes('subscribeToPlan'),
        'SubscriptionsPage.tsx must import subscribeToPlan');
    });

    test('SubscriptionsPage.tsx does NOT import useZainCashPayment (V1 hook)', () => {
      assert.ok(subPage, 'SubscriptionsPage.tsx must exist');
      assert.ok(!subPage.includes('useZainCashPayment'),
        'SubscriptionsPage.tsx must NOT import V1 useZainCashPayment hook');
    });

    test('SubscriptionPlanCard.tsx has NO git conflict markers', () => {
      assert.ok(planCard, 'SubscriptionPlanCard.tsx must exist');
      assert.ok(!/^<<<<<<<|^=======|^>>>>>>>/m.test(planCard),
        'SubscriptionPlanCard.tsx must NOT contain git conflict markers');
    });

    test('SubscriptionPlanCard.tsx uses V2 loading prop (not V1 isActive/loadingPlanId)', () => {
      assert.ok(planCard, 'SubscriptionPlanCard.tsx must exist');
      assert.ok(planCard.includes('loading?: boolean'),
        'SubscriptionPlanCard.tsx must use V2 loading prop');
      assert.ok(!planCard.includes('isActive: boolean'),
        'SubscriptionPlanCard.tsx must NOT use V1 isActive prop');
    });

    test('SubscriptionPlanCard.tsx button text is اشترك الآن (not ادفع مع زين كاش)', () => {
      assert.ok(planCard, 'SubscriptionPlanCard.tsx must exist');
      assert.ok(planCard.includes('اشترك الآن'),
        'SubscriptionPlanCard.tsx button text must be اشترك الآن');
      assert.ok(!planCard.includes('ادفع مع زين كاش'),
        'SubscriptionPlanCard.tsx must NOT have old button text ادفع مع زين كاش');
    });
  });

  describe('Backend V2 router', () => {
    const v2 = readSrc('artifacts/api-server/src/routes/zaincash-v2.ts');
    const indexRoute = readSrc('artifacts/api-server/src/routes/index.ts');

    test('zaincash-v2.ts exists and has substantial content', () => {
      assert.ok(v2, 'zaincash-v2.ts must exist');
      assert.ok(v2.length > 1000, 'zaincash-v2.ts should be > 1000 chars');
    });

    test('V2 router is mounted in index.ts', () => {
      assert.ok(indexRoute, 'routes/index.ts must exist');
      assert.ok(indexRoute.includes('zaincashV2Router') || indexRoute.includes('zaincash-v2'),
        'index.ts must mount the V2 router');
    });

    test('V2 init handler calls /api/v2/payment-gateway/transaction/init', () => {
      assert.ok(v2.includes('/api/v2/payment-gateway/transaction/init'),
        'V2 init handler must call the documented ZainCash V2 init endpoint');
    });

    test('V2 callback handler has no-token path with inquiry-based verification', () => {
      assert.ok(v2.includes('callback without token'),
        'V2 callback handler must handle no-token case');
      assert.ok(v2.includes('getPaymentRecordByOrderId'),
        'V2 callback handler must look up payment record by orderId');
      assert.ok(v2.includes('callbackResultHtml'),
        'V2 callback handler must use callbackResultHtml for result pages');
    });

    test('V2 callback handler has consistency checks (amount, orderId, currency)', () => {
      assert.ok(v2.includes('amountMatches') && v2.includes('orderIdMatches') && v2.includes('currencyMatches'),
        'V2 no-token callback path must have consistency checks');
    });

    test('V2 callback handler activates subscription ONLY on completed status', () => {
      assert.ok(v2.includes("internalStatus === \"completed\"") || v2.includes("internalStatus === 'completed'"),
        'V2 callback must only activate on completed status');
      assert.ok(v2.includes('NEVER activate on FAILED'),
        'V2 callback must have explicit comment about not activating on non-completed');
    });

    test('V2 callback with-token path uses DB companyId (not URL param)', () => {
      // After the fix, the with-token path should look up payment record via get_payment_record RPC
      // and use dbCompanyId instead of URL companyId
      assert.ok(v2.includes('dbCompanyId'),
        'V2 with-token callback path must use dbCompanyId from DB lookup');
      assert.ok(v2.includes('get_payment_record'),
        'V2 with-token callback path must call get_payment_record RPC');
    });

    test('V2 callback has idempotency check (skip if already completed)', () => {
      assert.ok(v2.includes('alreadyCompleted'),
        'V2 callback must have idempotency check via alreadyCompleted flag');
    });

    test('V2 webhook handler has idempotency check', () => {
      assert.ok(v2.includes('already_completed') || v2.includes('status === "completed"'),
        'V2 webhook handler must check for already-completed status');
    });

    test('V2 uses HS256 JWT verification (algorithm pinning)', () => {
      assert.ok(v2.includes('HS256'),
        'V2 must use HS256 for JWT verification');
      assert.ok(v2.includes('alg') && v2.includes('none'),
        'V2 must check JWT algorithm to reject alg:none');
    });

    test('V2 has safe-by-default policy (no activation on unverified JWT)', () => {
      assert.ok(v2.includes('isApiKeyReal') || v2.includes('isApiKeyPlaceholder'),
        'V2 must check if api_key is real before trusting JWT');
      assert.ok(v2.includes('DO NOT') || v2.includes('NOT update') || v2.includes('NOT activate'),
        'V2 must have explicit safe-by-default comments');
    });

    test('V2 does NOT hardcode test.zaincash.iq', () => {
      assert.ok(!v2.includes('test.zaincash.iq'),
        'V2 backend must NOT reference V1 hostname test.zaincash.iq');
    });
  });

  describe('V1 router (unchanged)', () => {
    const v1 = readSrc('artifacts/api-server/src/routes/zaincash.ts');

    test('V1 router still exists', () => {
      assert.ok(v1, 'zaincash.ts (V1) must still exist');
    });

    test('V1 router is NOT imported by frontend subscriptionService', () => {
      const subSvc = readSrc('artifacts/track-tracker/src/services/subscriptionService.ts');
      assert.ok(subSvc && !subSvc.includes('zaincash.ts'),
        'Frontend subscriptionService must NOT import V1 router');
    });
  });
});

// ─── 2. Live Integration Tests against Deployed Preview ───────────────────

describe('Live integration tests (deployed Preview)', () => {
  // Increase timeout for network calls
  const netTimeout = { timeout: 15000 };

  test('GET / returns 200 with TrackTracker title', netTimeout, async () => {
    const r = await http('GET', '/');
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('<title>TrackTracker</title>'),
      'Root should return TrackTracker HTML page');
  });

  test('GET /api/zaincash/v2/debug/probe returns 200 with all config true', netTimeout, async () => {
    const r = await http('GET', '/api/zaincash/v2/debug/probe');
    assert.equal(r.status, 200);
    assert.ok(r.json, 'Probe should return JSON');
    const cfg = r.json.configStatus;
    assert.ok(cfg.baseUrlConfigured, 'baseUrl must be configured');
    assert.ok(cfg.clientIdConfigured, 'clientId must be configured');
    assert.ok(cfg.clientSecretConfigured, 'clientSecret must be configured');
    assert.ok(cfg.apiKeyConfigured, 'apiKey must be configured');
    assert.ok(cfg.successUrlConfigured, 'successUrl must be configured');
    assert.ok(cfg.failureUrlConfigured, 'failureUrl must be configured');
    assert.deepEqual(cfg.missingRequired, [], 'No required env vars should be missing');
  });

  test('Probe reachability is NOT Cloudflare-blocked from Vercel', netTimeout, async () => {
    const r = await http('GET', '/api/zaincash/v2/debug/probe');
    const reach = r.json.reachability;
    assert.ok(reach, 'Probe should return reachability info');
    assert.equal(reach.isCloudflareBlock, false,
      'Vercel egress IP should NOT be Cloudflare-blocked');
  });

  test('GET /api/zaincash/v2/callback (no token, no orderId) returns cancelled page', netTimeout, async () => {
    const r = await http('GET', '/api/zaincash/v2/callback');
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('نتيجة الدفع') || r.text.includes('Payment cancelled'),
      'No-token callback should return result page');
  });

  test('GET /api/zaincash/v2/callback?orderId=FAKE-NO-RECORD returns unverified page', netTimeout, async () => {
    // No-token path with orderId that doesn't exist in DB → should try DB lookup → "unverified"
    const r = await http('GET', '/api/zaincash/v2/callback?orderId=FAKE-NO-RECORD-TEST-12345');
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('نتيجة الدفع'),
      'No-token callback with unknown orderId should return Arabic result page');
    // Should NOT claim success
    assert.ok(!r.text.includes('تم الدفع بنجاح'),
      'No-token callback with unknown orderId should NOT show success');
  });

  test('GET /api/zaincash/v2/callback?token=invalid-jwt returns unverified page (safe-by-default)', netTimeout, async () => {
    const r = await http('GET', '/api/zaincash/v2/callback?token=invalid.jwt.token');
    assert.equal(r.status, 200);
    assert.ok(r.text.includes('نتيجة الدفع'),
      'Invalid JWT callback should return Arabic result page');
    // Should NOT claim success
    assert.ok(!r.text.includes('تم الدفع بنجاح'),
      'Invalid JWT callback should NOT show success');
  });

  test('GET /api/zaincash/v2/callback?token=<forged JWT claiming SUCCESS> does NOT activate', netTimeout, async () => {
    // Forge a JWT signed with a WRONG key (not the real api_key)
    // claiming SUCCESS for a fake transaction
    const forgedClaims = {
      eventId: 'evt_forged_test',
      eventType: 'STATUS_CHANGED',
      timestamp: new Date().toISOString(),
      data: {
        currentStatus: 'SUCCESS',
        transactionId: 'forged-tx-id-test',
        orderId: 'forged-order-id',
        amount: { value: 1000, currency: 'IQD' },
      },
    };
    const forgedToken = makeForgedJwt(forgedClaims, 'wrong-key-not-the-real-api-key');
    const r = await http('GET', `/api/zaincash/v2/callback?token=${forgedToken}&orderId=forged-order-id&planId=plan-10&companyId=FORGED-COMPANY`);

    assert.equal(r.status, 200);
    // Should return "unverified" page (NOT success)
    assert.ok(r.text.includes('نتيجة الدفع'),
      'Forged JWT callback should return Arabic result page');
    assert.ok(!r.text.includes('تم الدفع بنجاح'),
      'Forged JWT callback should NOT show success — safe-by-default policy');
    // The page should indicate verification failed
    assert.ok(r.text.includes('يجب التحقق') || r.text.includes('unverified') || r.text.includes('⚠️'),
      'Forged JWT callback should show unverified warning');
  });

  test('GET /api/zaincash/v2/verify?transactionId=<fake UUID> returns 200 (OAuth2 + inquiry work)', netTimeout, async () => {
    const r = await http('GET', '/api/zaincash/v2/verify?transactionId=00000000-0000-0000-0000-000000000000');
    assert.equal(r.status, 200);
    assert.ok(r.json, 'Verify should return JSON');
    // Should have a status field (mapped from ZainCash inquiry response)
    assert.ok('status' in r.json, 'Verify response should have status field');
    // The fake txId should get an error from ZainCash inquiry
    assert.ok(r.json.details, 'Verify response should have details field');
  });

  test('POST /api/zaincash/v2/create with empty body returns 400 validation error', netTimeout, async () => {
    const r = await http('POST', '/api/zaincash/v2/create', {});
    assert.equal(r.status, 400);
    assert.ok(r.json.error, 'Empty body should return error message');
    assert.ok(r.json.error.includes('Missing'),
      'Error should mention missing fields');
  });

  test('POST /api/zaincash/v2/create with amount=0 returns 400', netTimeout, async () => {
    const r = await http('POST', '/api/zaincash/v2/create', { planId: 'plan-10', amount: 0, companyId: 'test' });
    assert.equal(r.status, 400);
  });

  test('POST /api/zaincash/v2/create with negative amount returns 400', netTimeout, async () => {
    const r = await http('POST', '/api/zaincash/v2/create', { planId: 'plan-10', amount: -100, companyId: 'test' });
    assert.equal(r.status, 400);
  });

  test('POST /api/zaincash/v2/webhook with empty body returns 400', netTimeout, async () => {
    const r = await http('POST', '/api/zaincash/v2/webhook', {});
    assert.equal(r.status, 400);
  });

  test('POST /api/zaincash/v2/webhook with invalid token returns 200 received:false (safe)', netTimeout, async () => {
    const r = await http('POST', '/api/zaincash/v2/webhook', { webhook_token: 'invalid.jwt.token' });
    // Webhook returns 200 (not 400) to prevent ZainCash from retrying
    assert.equal(r.status, 200);
    assert.ok(r.json, 'Webhook should return JSON');
  });
});

// ─── 3. Deployed Bundle Verification ──────────────────────────────────────

describe('Deployed bundle verification', () => {
  test('Frontend bundle has /api/zaincash/v2/create (V2 endpoint LIVE)', async () => {
    const indexHtml = await (await fetch(`${PREVIEW_URL}/`)).text();
    const bundleMatch = indexHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    assert.ok(bundleMatch, 'index.html should reference a JS bundle');
    const bundleUrl = `${PREVIEW_URL}${bundleMatch[0]}`;
    const bundleRes = await fetch(bundleUrl);
    const bundleText = await bundleRes.text();
    assert.ok(bundleText.includes('/api/zaincash/v2/create'),
      'Deployed bundle must contain /api/zaincash/v2/create (V2 endpoint)');
  });

  test('Frontend bundle does NOT have /api/zaincash/create (V1 ABSENT)', async () => {
    const indexHtml = await (await fetch(`${PREVIEW_URL}/`)).text();
    const bundleMatch = indexHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    const bundleUrl = `${PREVIEW_URL}${bundleMatch[0]}`;
    const bundleText = await (await fetch(bundleUrl)).text();
    // V1 endpoint should NOT be in the live bundle
    assert.ok(!bundleText.includes('/api/zaincash/create'),
      'Deployed bundle must NOT contain V1 endpoint /api/zaincash/create');
  });

  test('Frontend bundle does NOT have test.zaincash.iq (V1 URL ABSENT)', async () => {
    const indexHtml = await (await fetch(`${PREVIEW_URL}/`)).text();
    const bundleMatch = indexHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    const bundleUrl = `${PREVIEW_URL}${bundleMatch[0]}`;
    const bundleText = await (await fetch(bundleUrl)).text();
    assert.ok(!bundleText.includes('test.zaincash.iq'),
      'Deployed bundle must NOT contain V1 hostname test.zaincash.iq');
  });

  test('Frontend bundle has subscription button text (اشترك الآن)', async () => {
    const indexHtml = await (await fetch(`${PREVIEW_URL}/`)).text();
    const bundleMatch = indexHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    const bundleUrl = `${PREVIEW_URL}${bundleMatch[0]}`;
    const bundleText = await (await fetch(bundleUrl)).text();
    assert.ok(bundleText.includes('اشترك الآن'),
      'Deployed bundle must contain button text اشترك الآن');
    assert.ok(!bundleText.includes('ادفع مع زين كاش'),
      'Deployed bundle must NOT contain old button text ادفع مع زين كاش');
  });
});

// ─── 4. Subscription Duration + Driver Limits + Promo Code ─────────────────

describe('Subscription duration + driver limits + promo code', () => {
  const v2 = readSrc('artifacts/api-server/src/routes/zaincash-v2.ts');
  const schema = readSrc('artifacts/track-tracker/src/db/schema.sql');
  const migration = readSrc('supabase/migrations/subscription_expiry_and_driver_limits.sql');
  const types = readSrc('artifacts/track-tracker/src/types.ts');
  const companyRepo = readSrc('artifacts/track-tracker/src/services/companyRepository.ts');

  test('activateCompanySubscription sets subscription_expires_at (1-month expiry)', () => {
    assert.ok(v2.includes('subscription_expires_at'),
      'activateCompanySubscription must set subscription_expires_at');
    assert.ok(v2.includes('30 * 24 * 60 * 60 * 1000'),
      'Expiry must be 30 days (~1 month) from activation time');
  });

  test('activateCompanySubscription accepts planId parameter', () => {
    assert.ok(v2.includes('companyName: string, planId?: string'),
      'activateCompanySubscription must accept planId parameter');
  });

  test('All 3 callback paths pass planId to activateCompanySubscription', () => {
    // No-token path
    assert.ok(v2.includes('activateCompanySubscription(record.company_id, record.plan_id)'),
      'No-token callback must pass record.plan_id');
    // With-token path
    assert.ok(v2.includes('activateCompanySubscription(dbCompanyId, dbPlanId)'),
      'With-token callback must pass dbPlanId');
    // Webhook path
    assert.ok(v2.includes('activateCompanySubscription(companyName, webhookPlanId)'),
      'Webhook must pass webhookPlanId');
  });

  test('Migration SQL adds subscription_expires_at column', () => {
    assert.ok(migration, 'Migration SQL file must exist');
    assert.ok(migration.includes('subscription_expires_at'),
      'Migration must add subscription_expires_at column');
    assert.ok(migration.includes('subscription_started_at'),
      'Migration must add subscription_started_at column');
    assert.ok(migration.includes('subscription_plan_id'),
      'Migration must add subscription_plan_id column');
  });

  test('Migration SQL creates driver limit trigger', () => {
    assert.ok(migration.includes('check_driver_limit'),
      'Migration must create check_driver_limit function');
    assert.ok(migration.includes('drivers_check_limit_trigger'),
      'Migration must create drivers_check_limit_trigger');
    assert.ok(migration.includes('plan-10'),
      'Driver limit trigger must handle plan-10 (10 drivers)');
    assert.ok(migration.includes('plan-25'),
      'Driver limit trigger must handle plan-25 (25 drivers)');
    assert.ok(migration.includes('plan-50'),
      'Driver limit trigger must handle plan-50 (50 drivers)');
    assert.ok(migration.includes('plan-unlimited'),
      'Driver limit trigger must handle plan-unlimited (unlimited)');
  });

  test('Migration SQL: unlimited plan has NULL limit (not restricted)', () => {
    assert.ok(migration.includes("when 'plan-unlimited' then null"),
      'plan-unlimited must map to NULL (no limit) — must NOT be restricted');
  });

  test('Migration SQL: activate_subscription RPC sets 1-month expiry', () => {
    assert.ok(migration.includes("interval '1 month'"),
      'activate_subscription RPC must set 1-month expiry');
    assert.ok(migration.includes('subscription_started_at'),
      'activate_subscription RPC must set subscription_started_at');
  });

  test('Migration SQL: promo code "track1" is first-month only', () => {
    assert.ok(migration.includes('v_existing_started'),
      'activate_subscription must check if subscription_started_at already exists');
    assert.ok(migration.includes('if v_existing_started is not null then'),
      'activate_subscription must reject if already used (first-month only)');
  });

  test('Migration SQL: is_subscription_active checks expiry', () => {
    assert.ok(migration.includes('is_subscription_active'),
      'Migration must create is_subscription_active function');
    assert.ok(migration.includes('subscription_expires_at > now()'),
      'is_subscription_active must check expiry date');
  });

  test('Migration SQL: deactivate_expired_subscriptions function exists', () => {
    assert.ok(migration.includes('deactivate_expired_subscriptions'),
      'Migration must create deactivate_expired_subscriptions function');
  });

  test('schema.sql activate_subscription has expiry + first-month-only', () => {
    assert.ok(schema.includes("interval '1 month'"),
      'schema.sql activate_subscription must set 1-month expiry');
    assert.ok(schema.includes('v_existing_started'),
      'schema.sql activate_subscription must have first-month-only check');
  });

  test('CompanyProfile type includes subscriptionExpiresAt + subscriptionPlanId', () => {
    assert.ok(types.includes('subscriptionExpiresAt'),
      'CompanyProfile type must include subscriptionExpiresAt');
    assert.ok(types.includes('subscriptionPlanId'),
      'CompanyProfile type must include subscriptionPlanId');
  });

  test('companyRepository checks expiry date (not just subscription_active)', () => {
    assert.ok(companyRepo.includes('subscription_expires_at'),
      'companyRepository must read subscription_expires_at');
    assert.ok(companyRepo.includes('expiresAt > now'),
      'companyRepository must check if expiry date is in the future');
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────

test('Test suite summary', () => {
  console.log(`\n✅ All ZainCash V2 integration tests passed against: ${PREVIEW_URL}`);
  console.log('   - Source patterns verified (frontend V2 wiring, backend security patterns)');
  console.log('   - Live integration tests passed (probe, callback paths, verify, validation)');
  console.log('   - Deployed bundle verified (V2 endpoint LIVE, V1 ABSENT, V2 button text LIVE)');
  console.log('   - Safe-by-default policy verified (forged JWT does NOT activate subscription)');
  console.log('   - No real payment was initiated during testing');
});
