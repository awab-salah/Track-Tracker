#!/usr/bin/env node
/**
 * ZainCash UAT — focused OTP/PIN matrix test using official docs credentials.
 *
 * pub.dev official SDK docs say: Test customers: 9647802999569 / PIN 1111 / OTP 111111
 * User's message says:           OTP 11111
 * Laravel README says:           PIN 1234 / OTP 1111  (already proven wrong)
 *
 * Strategy: for each (pin, otp) combo, create a FRESH transaction, then:
 *   1. POST /transaction/processing        {id, phonenumber, pin}
 *   2. POST /transaction/processingOTP     {id, phonenumber, pin, otp}
 *   3. POST /transaction/get               (final status)
 * Decode any JWT tokens returned to extract the real status/msg.
 * Retries once on 503 (Cloudflare transient).
 */

const fs = require('fs');
const path = require('path');

const BASE = 'https://test.zaincash.iq';
const MERCHANT_ID = '5ffacf6612b5777c6d44266f';
const MSISDN = '9647835077893';
const SECRET = '$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYewgYpfR1O19gIh4SqyGWdmySZYPuS';
const PHONE = '9647802999569';

const OUT_DIR = '/home/z/my-project/download/zaincash-debug';
const TS = Date.now();

function b64urlDecode(s) {
  try {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch { return null; }
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const data = `${enc(header)}.${enc(payload)}`;
  const crypto = require('crypto');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${data}.${sig}`;
}

async function zc(endpoint, params, label, attempt = 1) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      'Accept': '*/*',
    },
    body,
  });
  const text = await res.text();
  if (res.status === 503 && attempt < 3) {
    console.log(`  [${label}] 503, retrying in 4s (attempt ${attempt})...`);
    await new Promise(r => setTimeout(r, 4000));
    return zc(endpoint, params, label, attempt + 1);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 300); }
  return { label, status: res.status, body: data };
}

async function createTx(orderId) {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({
    amount: 1000,
    serviceType: 'Other',
    orderId,
    redirectUrl: 'https://track-tracker-app.vercel.app/api/zaincash/callback?orderId=' + encodeURIComponent(orderId),
    iat: now,
    exp: now + 60 * 60 * 4,
    lang: 'ar',
  });
  const r = await zc('/transaction/init', {
    token,
    merchantId: MERCHANT_ID,
    lang: 'ar',
  }, 'INIT');
  return r;
}

async function runCombo(pin, otp, tag) {
  console.log(`\n╔════ COMBO ${tag}: PIN=${pin} OTP=${otp} ════╗`);
  const orderId = `otp-matrix-${tag}-${Date.now()}`;
  const init = await createTx(orderId);
  if (init.status !== 200 || typeof init.body !== 'string') {
    console.log(`  INIT failed: ${JSON.stringify(init.body).slice(0, 300)}`);
    return null;
  }
  const txId = init.body.replace(/"/g, '').trim();
  console.log(`  txId: ${txId}`);
  await new Promise(r => setTimeout(r, 1500));

  // STEP: processing
  const proc = await zc('/transaction/processing', { id: txId, phonenumber: PHONE, pin }, 'PROCESSING');
  let procMsg = null, procJwt = null;
  if (proc.body && typeof proc.body === 'object') {
    if (proc.body.url) {
      const m = String(proc.body.url).match(/token=([^&]+)/);
      if (m) { procJwt = decodeJwtPayload(decodeURIComponent(m[1])); procMsg = procJwt?.msg; }
    }
    console.log(`  PROCESSING: success=${proc.body.success} msg="${proc.body.msg || procMsg}" jwtStatus=${procJwt?.status}`);
  } else {
    console.log(`  PROCESSING: status=${proc.status} body=${String(proc.body).slice(0, 150)}`);
  }
  await new Promise(r => setTimeout(r, 1200));

  // STEP: pay (OTP)
  const pay = await zc('/transaction/processingOTP?type=MERCHANT_PAYMENT', {
    id: txId, phonenumber: PHONE, pin, otp,
  }, 'PAY');
  let payMsg = null, payJwt = null;
  if (pay.body && typeof pay.body === 'object') {
    if (pay.body.url) {
      const m = String(pay.body.url).match(/token=([^&]+)/);
      if (m) { payJwt = decodeJwtPayload(decodeURIComponent(m[1])); payMsg = payJwt?.msg; }
    }
    console.log(`  PAY: success=${pay.body.success} msg="${pay.body.msg || payMsg}" jwtStatus=${payJwt?.status}`);
  } else {
    console.log(`  PAY: status=${pay.status} body=${String(pay.body).slice(0, 150)}`);
  }
  await new Promise(r => setTimeout(r, 1200));

  // STEP: final status
  const now2 = Math.floor(Date.now() / 1000);
  const checkToken = signJwt({ id: txId, msisdn: MSISDN, iat: now2, exp: now2 + 14400 });
  const fin = await zc('/transaction/get', { merchantId: MERCHANT_ID, token: checkToken }, 'FINAL');
  let finalStatus = null, finalDue = null, finalFrom = null;
  if (fin.body && typeof fin.body === 'object' && fin.body.status) {
    finalStatus = fin.body.status;
    finalDue = fin.body.due || null;
    finalFrom = fin.body.from || null;
    console.log(`  FINAL: status=${finalStatus} due="${finalDue}" from=${finalFrom}`);
  } else {
    console.log(`  FINAL: status=${fin.status} body=${JSON.stringify(fin.body).slice(0, 150)}`);
  }

  return {
    tag, pin, otp, txId, orderId,
    processing: { success: proc.body?.success, msg: proc.body?.msg || procMsg, jwt: procJwt },
    pay: { success: pay.body?.success, msg: pay.body?.msg || payMsg, jwt: payJwt },
    final: { status: finalStatus, due: finalDue, from: finalFrom },
  };
}

async function main() {
  const combos = [
    { pin: '1111', otp: '111111', tag: 'pin1111-otp111111' },  // pub.dev docs
    { pin: '1111', otp: '11111',  tag: 'pin1111-otp11111' },   // user message
  ];
  const results = [];
  for (const c of combos) {
    try {
      const r = await runCombo(c.pin, c.otp, c.tag);
      if (r) results.push(r);
    } catch (e) {
      console.log(`  COMBO ${c.tag} ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  const out = path.join(OUT_DIR, `otp-matrix-${TS}.json`);
  fs.writeFileSync(out, JSON.stringify({ timestamp: new Date().toISOString(), phone: PHONE, results }, null, 2));
  console.log(`\nSaved: ${out}`);

  // Verdict
  for (const r of results) {
    const completed = r.final?.status === 'completed' || r.pay?.msg === 'succesful_transaction';
    console.log(`\n${r.tag}: ${completed ? '✅ COMPLETED' : '❌ not completed (final=' + (r.final?.status || '?') + ', payMsg=' + (r.pay?.msg || '?') + ')'} `);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
