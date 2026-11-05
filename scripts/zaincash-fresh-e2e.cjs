#!/usr/bin/env node
/**
 * ZainCash UAT — Fresh E2E test from scratch
 *
 * Per official docs.zaincash.iq (v2 docs):
 *   - UAT base URL: https://pg-api-uat.zaincash.iq (v2)
 *   - We are integrated with v1: https://test.zaincash.iq
 *   - Official v2 customer test wallets (multiple):
 *       #1: MSISDN 9647802999569 / PIN 1111 / OTP 111111
 *       #2: MSISDN 9647829744432 / PIN 1111 / OTP 111111
 *       #3: MSISDN 9647829744464 / PIN 1111 / OTP 111111
 *       (and #4 ...)
 *
 * Strategy:
 *   Use the EXISTING deployed /api/zaincash/create + /api/zaincash/debug-complete-payment
 *   (no code changes, no new endpoints).
 *   For each documented test wallet:
 *     1. Create transaction (v1 init)
 *     2. Drive the v1 /transaction/processing + /transaction/processingOTP with
 *        phone, PIN, OTP via the existing debug endpoint
 *     3. Verify via /api/zaincash/verify
 *     4. Check payment_records status in Supabase
 *     5. Check company subscription_active
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

function b64urlDecode(s) {
  try { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return null; }
}
function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCompany() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=id,name,subscription_active&limit=5`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error('No companies in Supabase');
  return data;
}

async function createTx(companyName) {
  const res = await fetch(`${API_BASE}/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'plan-10', amount: 1000, companyId: companyName }),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: { raw: text.slice(0, 500) } }; }
}

async function completePayment(txId, phone, pin, otp) {
  const res = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: txId, phone, pin, otp }),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: { raw: text.slice(0, 500) } }; }
}

async function verifyTx(txId) {
  const res = await fetch(`${API_BASE}/zaincash/verify?transactionId=${txId}`);
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: { raw: text.slice(0, 500) } }; }
}

async function getPaymentRecord(txId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_payment_record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ p_id: txId }),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function getCompanyState(name) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?name=eq.${encodeURIComponent(name)}&select=id,name,subscription_active`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function extractStep(step) {
  if (!step) return null;
  const b = step.body;
  if (b && typeof b === 'object') {
    let jwt = null;
    if (b.url) {
      const m = String(b.url).match(/token=([^&]+)/);
      if (m) jwt = decodeJwtPayload(decodeURIComponent(m[1]));
    }
    return {
      success: b.success,
      msg: b.msg || jwt?.msg || null,
      jwtStatus: jwt?.status || null,
    };
  }
  return null;
}

async function runOne(wallet, companyName) {
  const tag = `wallet${wallet.idx}_${wallet.phone.slice(-4)}`;
  console.log(`\n╔════ ${tag} : phone=${wallet.phone} PIN=${wallet.pin} OTP=${wallet.otp} ════╗`);

  const created = await createTx(companyName);
  console.log(`  CREATE status=${created.status} txId=${created.body?.transactionId || 'NONE'}`);
  if (!created.body?.transactionId) {
    console.log(`  CREATE body: ${JSON.stringify(created.body).slice(0, 200)}`);
    return { tag, wallet, create: created, completed: false, reason: 'create_failed' };
  }
  const txId = created.body.transactionId;
  await sleep(2500);

  const comp = await completePayment(txId, wallet.phone, wallet.pin, wallet.otp);
  const steps = comp.body?.steps || {};
  const processing = extractStep(steps.processing);
  const pay = extractStep(steps.pay);
  console.log(`  PROCESSING: success=${processing?.success} msg="${processing?.msg}" jwt=${processing?.jwtStatus}`);
  console.log(`  PAY:        success=${pay?.success} msg="${pay?.msg}" jwt=${pay?.jwtStatus}`);

  await sleep(2000);

  const verify = await verifyTx(txId);
  const txStatus = verify.body?.status || verify.body?.details?.status;
  const due = verify.body?.details?.due;
  const from = verify.body?.details?.from;
  console.log(`  VERIFY: http=${verify.status} status=${txStatus} due=${due} from=${from}`);

  const record = await getPaymentRecord(txId);
  const recordStatus = record?.[0]?.status;
  console.log(`  PAYMENT_RECORD: status=${recordStatus}`);

  const companyState = await getCompanyState(companyName);
  const subActive = companyState?.[0]?.subscription_active;
  console.log(`  COMPANY ${companyName}: subscription_active=${subActive}`);

  const completed = txStatus === 'completed' || pay?.msg === 'succesful_transaction';

  const result = {
    tag, wallet, txId, orderId: created.body.orderId,
    processing, pay,
    verify: { httpStatus: verify.status, status: txStatus, due, from },
    paymentRecord: recordStatus,
    subscriptionActive: subActive,
    completed,
  };
  console.log(`  => ${completed ? '✅ COMPLETED' : '❌ NOT COMPLETED'}`);
  return result;
}

async function main() {
  console.log('=== Fresh ZainCash UAT E2E test using EXACT documented v2 credentials ===');
  console.log('Source: docs.zaincash.iq + thejano/zaincash-laravel config + waadmawlood README');

  // Official v2 docs (docs.zaincash.iq) document these customer test wallets:
  const wallets = [
    { idx: 1, phone: '9647802999569', pin: '1111', otp: '111111' },
    { idx: 2, phone: '9647829744432', pin: '1111', otp: '111111' },
    { idx: 3, phone: '9647829744464', pin: '1111', otp: '111111' },
  ];

  const companies = await getCompany();
  const companyName = companies[0].name;
  console.log(`Using company: ${companyName} (current subscription_active=${companies[0].subscription_active})`);
  console.log(`Initial subscription_active state: ${companies[0].subscription_active}`);

  const results = [];
  for (const w of wallets) {
    try {
      const r = await runOne(w, companyName);
      results.push(r);
      fs.writeFileSync(path.join(OUT_DIR, `fresh-e2e-${TS}.json`), JSON.stringify({ timestamp: new Date().toISOString(), companyName, results }, null, 2));
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      results.push({ tag: `wallet${w.idx}_${w.phone.slice(-4)}`, wallet: w, error: e.message });
    }
    await sleep(5000);  // avoid ZainCash rate-limit
  }

  console.log('\n=== FINAL SUMMARY ===');
  results.forEach(r => {
    console.log(`${r.tag}: ${r.completed ? '✅' : '❌'} | txId=${r.txId || 'N/A'} | proc=${r.processing?.msg || r.error} | pay=${r.pay?.msg || ''} | final=${r.verify?.status || ''} | payRec=${r.paymentRecord || ''} | subActive=${r.subscriptionActive}`);
  });
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
