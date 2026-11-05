#!/usr/bin/env node
/**
 * Comprehensive PIN/OTP test for ZainCash UAT.
 *
 * Creates a fresh transaction for each PIN attempt and records the exact
 * error message returned by ZainCash's /transaction/processing endpoint.
 *
 * Spacing: 5 seconds between attempts to avoid rate-limiting.
 * Saves full debug output for each attempt.
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

function decodeJwtFromUrl(url) {
  if (!url) return null;
  try {
    const token = new URL(url).searchParams.get('token');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch { return null; }
}

async function tryPin(pin, otp = '1111') {
  log(`\n=== Trying PIN: ${pin}, OTP: ${otp} ===`);

  const transactionId = await createTransaction();
  if (!transactionId) {
    log(`Failed to create transaction`);
    return null;
  }
  log(`Transaction: ${transactionId}`);

  await sleep(3000);

  const res = await fetch(`${API_BASE}/zaincash/debug-complete-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId,
      phone: '9647802999569',
      pin,
      otp,
    }),
  });
  const body = await res.json();

  // Save full response
  fs.writeFileSync(path.join(OUT_DIR, `pin-test-${pin.replace(/[^0-9a-z]/gi, '_')}-${TS}.json`), JSON.stringify(body, null, 2));

  const processingJwt = decodeJwtFromUrl(body?.steps?.processing?.body?.url);
  const payJwt = decodeJwtFromUrl(body?.steps?.pay?.body?.url);
  const finalStatus = body?.steps?.finalCheck?.body?.status;
  const finalDue = body?.steps?.finalCheck?.body?.due;
  const finalFrom = body?.steps?.finalCheck?.body?.from;

  log(`  Processing: success=${body?.steps?.processing?.body?.success}, msg=${processingJwt?.msg || 'N/A'}`);
  log(`  Pay: success=${body?.steps?.pay?.body?.success}, msg=${payJwt?.msg || 'N/A'}`);
  log(`  Final: status=${finalStatus}, due=${finalDue}, from=${finalFrom}`);

  return {
    pin,
    otp,
    transactionId,
    processingSuccess: body?.steps?.processing?.body?.success,
    processingMsg: processingJwt?.msg,
    paySuccess: body?.steps?.pay?.body?.success,
    payMsg: payJwt?.msg,
    finalStatus,
    finalDue,
    finalFrom,
  };
}

async function main() {
  log('Comprehensive PIN/OTP test for ZainCash UAT');
  log(`Phone: 9647802999569 (customer test wallet from Laravel README)`);
  log(`OTP: 1111 (default), will try others if PIN succeeds`);

  const pinsToTry = [
    '1234',     // Laravel README default
    '1111',     // Same as OTP
    '0000',     // Common default
    '9999',     // Common test
    '12345',    // 5 digits
    '123456',   // 6 digits
    '000000',   // 6 zeros
    '4321',     // Reversed
    '1000',     // Matches amount
    '5ffac',    // Merchant ID prefix
  ];

  const results = [];

  for (const pin of pinsToTry) {
    const result = await tryPin(pin);
    if (result) results.push(result);

    // If processing succeeded, also try different OTPs
    if (result?.processingSuccess === 1) {
      log(`\n🎉 PIN ${pin} SUCCEEDED at processing! Trying different OTPs...`);
      const otpsToTry = ['1111', '0000', '1234', '9999', '000000'];
      for (const otp of otpsToTry) {
        if (otp === '1111') continue; // Already tried
        const otpResult = await tryPin(pin, otp);
        if (otpResult) results.push(otpResult);
        if (otpResult?.finalStatus === 'completed') {
          log(`🎉🎉🎉 FOUND WORKING COMBINATION: PIN=${pin}, OTP=${otp} 🎉🎉🎉`);
          break;
        }
      }
      break; // Stop trying other PINs
    }

    await sleep(5000); // 5 second delay between attempts
  }

  // Save summary
  const summary = {
    timestamp: ts(),
    phone: '9647802999569',
    results,
    successfulPins: results.filter(r => r.processingSuccess === 1).map(r => r.pin),
    completedFlows: results.filter(r => r.finalStatus === 'completed'),
  };

  fs.writeFileSync(path.join(OUT_DIR, `comprehensive-pin-test-summary-${TS}.json`), JSON.stringify(summary, null, 2));
  log(`\n=== FINAL SUMMARY ===`);
  log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
