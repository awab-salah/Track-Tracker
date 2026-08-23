#!/usr/bin/env node
/**
 * ZainCash End-to-End UAT Payment Test
 *
 * Drives the full payment flow:
 *   1. Create a real transaction via POST /api/zaincash/create
 *   2. Complete the payment server-side via POST /api/zaincash/debug-complete-payment
 *      (uses the documented test customer wallet: 9647802999569, PIN 1234, OTP 1111)
 *   3. Verify the payment via GET /api/zaincash/verify
 *   4. Verify the payment_records row was updated to status=completed
 *   5. Verify the company's subscription_active was set to true
 *
 * Saves all responses to /home/z/my-project/download/zaincash-debug/
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://track-tracker-app.vercel.app/api';
const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

const OUT_DIR = '/home/z/my-project/download/zaincash-debug';
const TS = Date.now();

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[${ts()}]`, ...args); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  // Use a real company name from the database
  // First, list companies to find one to test with
  log('Fetching companies from Supabase...');
  const companiesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?select=id,name,subscription_active&limit=5`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const companies = await companiesRes.json();
  log(`Found ${companies.length || 0} companies (status ${companiesRes.status})`);
  if (companies.length > 0) {
    log('First company:', JSON.stringify(companies[0]));
  }
  if (!Array.isArray(companies) || companies.length === 0) {
    log('No companies found. Using a test company name.');
    companies.push({ name: 'TestCompany', id: 'test-id', subscription_active: false });
  }

  // Pick the first company
  const testCompany = companies[0];
  const companyName = testCompany.name;
  const companyId = companyName; // companyId in our flow is the company NAME
  const planId = 'plan-10';
  const amount = 1000; // 1000 IQD (minimum is 250 per Laravel config)

  log(`Test parameters:`);
  log(`  Company name (companyId): ${companyId}`);
  log(`  Plan ID: ${planId}`);
  log(`  Amount: ${amount} IQD`);
  log(`  Initial subscription_active: ${testCompany.subscription_active}`);

  // ── Step 1: Create transaction ─────────────────────────────────────────
  log('\n=== STEP 1: Create transaction ===');
  const createRes = await fetch(`${API_BASE}/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, amount, companyId }),
  });
  const createBody = await createRes.text();
  log(`Create status: ${createRes.status}`);
  log(`Create body: ${createBody}`);
  fs.writeFileSync(path.join(OUT_DIR, `e2e-01-create-${TS}.json`), createBody);

  let createData;
  try { createData = JSON.parse(createBody); } catch { log('Failed to parse create body as JSON'); return; }

  if (!createData.transactionId) {
    log('ERROR: No transactionId in create response');
    return;
  }

  const transactionId = createData.transactionId;
  const orderId = createData.orderId;
  log(`Transaction ID: ${transactionId}`);
  log(`Order ID: ${orderId}`);

  // Wait a moment for the transaction to register in ZainCash
  await sleep(2000);

  // ── Step 2: Complete payment via debug endpoint ────────────────────────
  log('\n=== STEP 2: Complete payment via debug-complete-payment ===');
  log('Using documented test credentials:');
  log('  Phone: 9647802999569');
  log('  PIN:   1234');
  log('  OTP:   1111');
  const completeRes = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  });
  const completeBody = await completeRes.text();
  log(`Complete status: ${completeRes.status}`);
  log(`Complete body (first 2000 chars): ${completeBody.slice(0, 2000)}`);
  fs.writeFileSync(path.join(OUT_DIR, `e2e-02-complete-${TS}.json`), completeBody);

  let completeData;
  try { completeData = JSON.parse(completeBody); } catch { log('Failed to parse complete body as JSON'); }

  // Wait for callback processing
  await sleep(2000);

  // ── Step 3: Verify payment via verify endpoint ──────────────────────────
  log('\n=== STEP 3: Verify payment via verify endpoint ===');
  const verifyRes = await fetch(`${API_BASE}/zaincash/verify?transactionId=${transactionId}`);
  const verifyBody = await verifyRes.text();
  log(`Verify status: ${verifyRes.status}`);
  log(`Verify body (first 2000 chars): ${verifyBody.slice(0, 2000)}`);
  fs.writeFileSync(path.join(OUT_DIR, `e2e-03-verify-${TS}.json`), verifyBody);

  // Wait for callback processing
  await sleep(1000);

  // ── Step 4: Check payment_records in Supabase ─────────────────────────
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
  log(`payment_records RPC body: ${paymentRecordBody}`);
  fs.writeFileSync(path.join(OUT_DIR, `e2e-04-payment-record-${TS}.json`), paymentRecordBody);

  // ── Step 5: Check company subscription_active ─────────────────────────
  log('\n=== STEP 5: Check company subscription_active ===');
  const companyCheckRes = await fetch(
    `${SUPABASE_URL}/rest/v1/companies?name=eq.${encodeURIComponent(companyName)}&select=id,name,subscription_active`,
    {
      method: 'GET',
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
  fs.writeFileSync(path.join(OUT_DIR, `e2e-05-company-check-${TS}.json`), companyCheckBody);

  // ── Summary ────────────────────────────────────────────────────────────
  let companyData;
  try { companyData = JSON.parse(companyCheckBody); } catch {}

  const summary = {
    timestamp: ts(),
    transactionId,
    orderId,
    companyName,
    createStatus: createRes.status,
    completeStatus: completeRes.status,
    verifyStatus: verifyRes.status,
    completeSuccess: completeData?.success,
    completeSummary: completeData?.summary,
    paymentRecordStatus: JSON.parse(paymentRecordBody)[0]?.status,
    companySubscriptionActive: companyData?.[0]?.subscription_active,
    outcome: null,
  };

  // Determine outcome
  if (summary.completeSuccess === true && summary.paymentRecordStatus === 'completed' && summary.companySubscriptionActive === true) {
    summary.outcome = 'A_SUCCESS';
    log('\n✅✅✅ OUTCOME A: Payment completed, payment_records updated, subscription activated ✅✅✅');
  } else if (summary.completeSuccess === false) {
    summary.outcome = 'B_NEEDS_INVESTIGATION';
    log('\n⚠️ Payment did not complete successfully. See debug output for details.');
  } else {
    summary.outcome = 'PARTIAL';
    log('\n⚠️ Partial success — some steps completed but not all. See debug output.');
  }

  fs.writeFileSync(path.join(OUT_DIR, `e2e-00-summary-${TS}.json`), JSON.stringify(summary, null, 2));
  log(`\nSummary saved to: ${OUT_DIR}/e2e-00-summary-${TS}.json`);
  log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
