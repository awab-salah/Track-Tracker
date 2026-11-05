#!/usr/bin/env node
/**
 * ZainCash UAT — PIN/OTP matrix via deployed Vercel API
 * (Cloudflare blocks direct local calls to test.zaincash.iq)
 *
 * Combos to test (official docs variants):
 *   A: PIN 1111 + OTP 111111  (pub.dev official SDK docs)
 *   B: PIN 1111 + OTP 11111   (user message)
 * Each combo gets a FRESH transaction.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://track-tracker-app.vercel.app/api';
const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';
const PHONE = '9647802999569';

const OUT_DIR = '/home/z/my-project/download/zaincash-debug';
const TS = Date.now();

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function b64urlDecode(s) {
  try { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { return null; }
}
function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
}

async function createTx(companyId) {
  const res = await fetch(`${API_BASE}/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'plan-10', amount: 1000, companyId }),
  });
  const body = await res.json();
  return body;
}

async function completePayment(txId, pin, otp) {
  const res = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: txId, phone: PHONE, pin, otp }),
  });
  let body;
  try { body = await res.json(); } catch { body = { raw: (await res.text()).slice(0, 300) }; }
  return { status: res.status, body };
}

async function verifyTx(txId) {
  const res = await fetch(`${API_BASE}/zaincash/verify?transactionId=${txId}`);
  let body;
  try { body = await res.json(); } catch { body = { raw: 'nonjson' }; }
  return { status: res.status, body };
}

function extractStep(jwtAndBody) {
  // step = {label, status, body, rawBody}
  if (!jwtAndBody) return { success: null, msg: null, jwtStatus: null };
  const b = jwtAndBody.body;
  if (b && typeof b === 'object') {
    let jwtMsg = null, jwtStatus = null;
    if (b.url) {
      const m = String(b.url).match(/token=([^&]+)/);
      if (m) {
        const p = decodeJwtPayload(decodeURIComponent(m[1]));
        jwtMsg = p?.msg; jwtStatus = p?.status;
      }
    }
    return { success: b.success, msg: b.msg || jwtMsg, jwtStatus, jwt: jwtMsg ? { msg: jwtMsg, status: jwtStatus } : null };
  }
  return { success: null, msg: String(b).slice(0, 120), jwtStatus: null };
}

async function runCombo(pin, otp, tag, companyName) {
  console.log(`\n╔════ ${tag}: PIN=${pin} OTP=${otp} ════╗`);
  const created = await createTx(companyName);
  if (!created.transactionId) {
    console.log(`  CREATE failed: ${JSON.stringify(created).slice(0, 200)}`);
    return null;
  }
  const txId = created.transactionId;
  console.log(`  txId: ${txId}`);
  await sleep(2500);

  const comp = await completePayment(txId, pin, otp);
  const steps = comp.body?.steps || {};
  const processing = extractStep(steps.processing);
  const pay = extractStep(steps.pay);
  console.log(`  PROCESSING: success=${processing.success} msg="${processing.msg}" jwtStatus=${processing.jwtStatus}`);
  console.log(`  PAY:        success=${pay.success} msg="${pay.msg}" jwtStatus=${pay.jwtStatus}`);

  await sleep(2000);
  const ver = await verifyTx(txId);
  const verTx = ver.body?.transaction;
  console.log(`  VERIFY: status=${ver.status} txStatus=${verTx?.status || ver.body?.status || JSON.stringify(ver.body).slice(0,120)}`);

  const result = {
    tag, pin, otp, txId, orderId: created.orderId,
    processing, pay,
    verify: { httpStatus: ver.status, txStatus: verTx?.status ?? ver.body?.status ?? null, raw: JSON.stringify(ver.body).slice(0, 500) },
    completed: verTx?.status === 'completed' || pay.msg === 'succesful_transaction',
  };
  console.log(`  => ${result.completed ? '✅ COMPLETED' : '❌ NOT COMPLETED'}`);
  return result;
}

async function main() {
  // Get company
  const cRes = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=name&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const companies = await cRes.json();
  const companyName = companies[0]?.name || 'TestCompany';
  console.log(`Company: ${companyName}`);

  const combos = [
    { pin: '1111', otp: '111111', tag: 'A-pin1111-otp111111' },
    { pin: '1111', otp: '11111',  tag: 'B-pin1111-otp11111' },
  ];
  const results = [];
  for (const c of combos) {
    try {
      const r = await runCombo(c.pin, c.otp, c.tag, companyName);
      if (r) results.push(r);
      fs.writeFileSync(path.join(OUT_DIR, `matrix-${TS}.json`), JSON.stringify({ timestamp: new Date().toISOString(), phone: PHONE, results }, null, 2));
    } catch (e) { console.log(`  ERROR: ${e.message}`); }
    await sleep(4000);
  }
  console.log('\n=== MATRIX SUMMARY ===');
  results.forEach(r => console.log(`${r.tag}: completed=${r.completed} | processing: ${r.processing.msg} | pay: ${r.pay.msg}`));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
