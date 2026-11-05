#!/usr/bin/env node
/**
 * ZainCash End-to-End UAT Payment Test — OFFICIAL DOCS CREDENTIALS
 *
 * Uses ONLY the credentials currently shown in the official ZainCash docs:
 *   MSISDN: 9647802999569
 *   PIN:    1111
 *   OTP:    11111
 *
 * Flow:
 *   1. Create a real transaction via POST /api/zaincash/create
 *   2. Complete the payment via POST /api/zaincash/debug-complete-payment
 *      passing phone/pin/otp explicitly from official docs
 *   3. Verify the payment via GET /api/zaincash/verify
 *   4. Verify the payment_records row status in Supabase
 *   5. Verify the company's subscription_active
 *
 * Saves all responses to /home/z/my-project/download/zaincash-debug/
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://track-tracker-app.vercel.app/api';
const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

// ── OFFICIAL ZAINCASH DOCS CREDENTIALS (DO NOT CHANGE) ─────────────────
const DOCS_PHONE = '9647802999569';
const DOCS_PIN = '1111';
const DOCS_OTP = '11111';
// ────────────────────────────────────────────────────────────────────────

const OUT_DIR = '/home/z/my-project/download/zaincash-debug';
const TS = Date.now();

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[${ts()}]`, ...args); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  log('=== ZainCash E2E Test with OFFICIAL DOCS credentials ===');
  log(`Phone: ${DOCS_PHONE}  PIN: ${DOCS_PIN}  OTP: ${DOCS_OTP}`);

  // Fetch a company to test with
  log('\nFetching companies from Supabase...');
  const companiesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?select=id,name,subscription_active&limit=5`,
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const companies = await companiesRes.json();
  if (!Array.isArray(companies) || companies.length === 0) {
    log('ERROR: No companies found in Supabase');
    return;
  }
  const testCompany = companies[0];
  const companyName = testCompany.name;
  const companyId = companyName; // companyId in our flow = company NAME
  const planId = 'plan-10';
  const amount = 1000; // IQD

  log(`Test company: ${companyName} (subscription_active=${testCompany.subscription_active})`);

  // ── Step 1: Create transaction ─────────────────────────────────────────
  log('\n=== STEP 1: Create transaction ===');
  const createRes = await fetch(`${API_BASE}/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, amount, companyId }),
  });
  const createBody = await createRes.text();
  log(`Create status: ${createRes.status}`);
  log(`Create body: ${createBody.slice(0, 1500)}`);
  fs.writeFileSync(path.join(OUT_DIR, `docs-01-create-${TS}.json`), createBody);

  let createData;
  try { createData = JSON.parse(createBody); } catch { log('Failed to parse create body'); return; }
  if (!createData.transactionId) {
    log('ERROR: No transactionId in create response');
    return;
  }
  const transactionId = createData.transactionId;
  log(`Transaction ID: ${transactionId}`);

  await sleep(2000);

  // ── Step 2: Complete payment with OFFICIAL DOCS credentials ────────────
  log('\n=== STEP 2: Complete payment (docs credentials: PIN 1111, OTP 11111) ===');
  const completeRes = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId,
      phone: DOCS_PHONE,
      pin: DOCS_PIN,
      otp: DOCS_OTP,
    }),
  });
  const completeBody = await completeRes.text();
  log(`Complete status: ${completeRes.status}`);
  log(`Complete body: ${completeBody.slice(0, 2500)}`);
  fs.writeFileSync(path.join(OUT_DIR, `docs-02-complete-${TS}.json`), completeBody);

  let completeData;
  try { completeData = JSON.parse(completeBody); } catch {}

  await sleep(2000);

  // ── Step 3: Verify payment ──────────────────────────────────────────────
  log('\n=== STEP 3: Verify payment via verify endpoint ===');
  const verifyRes = await fetch(`${API_BASE}/zaincash/verify?transactionId=${transactionId}`);
  const verifyBody = await verifyRes.text();
  log(`Verify status: ${verifyRes.status}`);
  log(`Verify body: ${verifyBody.slice(0, 1500)}`);
  fs.writeFileSync(path.join(OUT_DIR, `docs-03-verify-${TS}.json`), verifyBody);

  await sleep(1500);

  // ── Step 4: Check payment_records ───────────────────────────────────────
  log('\n=== STEP 4: Check payment_records via RPC ===');
  const paymentRecordRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_payment_record`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ p_id: transactionId }),
  });
  const paymentRecordBody = await paymentRecordRes.text();
  log(`payment_records RPC status: ${paymentRecordRes.status}`);
  log(`payment_records RPC body: ${paymentRecordBody.slice(0, 1500)}`);
  fs.writeFileSync(path.join(OUT_DIR, `docs-04-payment-record-${TS}.json`), paymentRecordBody);

  // ── Step 5: Check company subscription_active ───────────────────────────
  log('\n=== STEP 5: Check company subscription_active ===');
  const companyCheckRes = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?name=eq.${encodeURIComponent(companyName)}&select=id,name,subscription_active`,
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const companyCheckBody = await companyCheckRes.text();
  log(`Company check status: ${companyCheckRes.status}`);
  log(`Company check body: ${companyCheckBody}`);
  fs.writeFileSync(path.join(OUT_DIR, `docs-05-company-check-${TS}.json`), companyCheckBody);

  // ── Summary ─────────────────────────────────────────────────────────────
  let companyData;
  try { companyData = JSON.parse(companyCheckBody); } catch {}

  // Extract key info from complete response
  const processingResult = completeData?.result?.find?.(r => r.label === 'PROCESSING') || completeData?.processing;
  const payResult = completeData?.result?.find?.(r => r.label === 'PAY') || completeData?.pay;

  const summary = {
    timestamp: ts(),
    credentialsUsed: { phone: DOCS_PHONE, pin: DOCS_PIN, otp: DOCS_OTP },
    transactionId,
    orderId: createData.orderId,
    companyName,
    createStatus: createRes.status,
    completeStatus: completeRes.status,
    completeSuccess: completeData?.success,
    finalStatus: completeData?.finalStatus || completeData?.summary,
    paymentRecordStatus: (JSON.parse(paymentRecordBody) || [])[0]?.status ?? null,
    companySubscriptionActive: companyData?.[0]?.subscription_active ?? null,
    outcome: null,
  };

  if (summary.completeSuccess === true && summary.paymentRecordStatus === 'completed' && summary.companySubscriptionActive === true) {
    summary.outcome = 'A_SUCCESS';
    log('\n✅✅✅ OUTCOME A: Payment completed + subscription activated ✅✅✅');
  } else if (summary.completeSuccess === false) {
    summary.outcome = 'B_FAILED';
    log('\n❌ Payment failed with docs credentials. Details in debug output.');
  } else {
    summary.outcome = 'PARTIAL';
    log('\n⚠️ Partial success — see debug output.');
  }

  fs.writeFileSync(path.join(OUT_DIR, `docs-00-summary-${TS}.json`), JSON.stringify(summary, null, 2));
  log(`\nSummary: ${JSON.stringify(summary, null, 2)}`);
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
