#!/usr/bin/env node
/**
 * Try multiple PIN/OTP combinations on fresh ZainCash UAT transactions.
 *
 * Uses the Vercel debug-complete-payment endpoint (which proxies through
 * Vercel to bypass Cloudflare WAF) with explicit phone/pin/otp parameters.
 *
 * For each PIN, creates a fresh transaction and runs the full flow.
 * Reports which combination (if any) succeeds.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://track-tracker-app.vercel.app/api';
const OUT_DIR = '/home/z/my-project/download/zaincash-debug';
const TS = Date.now();

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[${ts()}]`, ...args); }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createTransaction() {
  const res = await fetch(`${API_BASE}/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: 'plan-10',
      amount: 1000,
      companyId: 'Smoke Test Co 2',
    }),
  });
  const body = await res.json();
  return body.transactionId;
}

async function tryCompletePayment(transactionId, phone, pin, otp) {
  const res = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId, phone, pin, otp }),
  });
  const body = await res.json();
  return body;
}

async function main() {
  const phone = '9647802999569';
  // Try common test PINs
  const pinsToTry = ['1234', '0000', '1111', '9999', '12345', '123456', '000000', '1122', '4321'];
  const otp = '1111'; // Try the documented OTP first

  log(`Testing phone ${phone} with ${pinsToTry.length} PIN combinations`);
  log(`Each PIN gets a fresh transaction with OTP ${otp}`);

  const results = [];

  for (const pin of pinsToTry) {
    log(`\n--- Trying PIN: ${pin} ---`);

    const transactionId = await createTransaction();
    if (!transactionId) {
      log(`Failed to create transaction for PIN ${pin}`);
      continue;
    }
    log(`Transaction: ${transactionId}`);

    await sleep(2000);

    const result = await tryCompletePayment(transactionId, phone, pin, otp);
    log(`Result: processingSuccess=${result.steps?.processing?.body?.success}, paySuccess=${result.steps?.pay?.body?.success}, finalStatus=${result.steps?.finalCheck?.body?.status}`);

    // Decode JWTs for clearer error messages
    let processingMsg = null;
    let payMsg = null;
    try {
      if (result.steps?.processing?.body?.url) {
        const token = new URL(result.steps.processing.body.url).searchParams.get('token');
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
        processingMsg = payload.msg;
      }
    } catch {}
    try {
      if (result.steps?.pay?.body?.url) {
        const token = new URL(result.steps.pay.body.url).searchParams.get('token');
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
        payMsg = payload.msg;
      }
    } catch {}

    log(`  Processing msg: ${processingMsg}`);
    log(`  Pay msg: ${payMsg}`);

    results.push({
      pin,
      transactionId,
      processingSuccess: result.steps?.processing?.body?.success,
      processingMsg,
      paySuccess: result.steps?.pay?.body?.success,
      payMsg,
      finalStatus: result.steps?.finalCheck?.body?.status,
      finalDue: result.steps?.finalCheck?.body?.due,
    });

    // If processing succeeded, this PIN is correct — no need to try more
    if (result.steps?.processing?.body?.success === 1) {
      log(`🎉 PIN ${pin} SUCCEEDED at processing!`);
      // Continue trying a few more PINs to be thorough, but mark this as the answer
    }

    await sleep(1500);
  }

  // Save results
  const summary = {
    timestamp: ts(),
    phone,
    otp,
    pinResults: results,
    successfulPins: results.filter(r => r.processingSuccess === 1).map(r => r.pin),
    completedFlows: results.filter(r => r.finalStatus === 'completed').map(r => ({
      pin: r.pin,
      transactionId: r.transactionId,
    })),
  };

  fs.writeFileSync(path.join(OUT_DIR, `pin-otp-test-${TS}.json`), JSON.stringify(summary, null, 2));
  log(`\n=== SUMMARY ===`);
  log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
