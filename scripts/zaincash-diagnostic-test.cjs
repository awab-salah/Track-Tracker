#!/usr/bin/env node
/**
 * Determine if the issue is the PHONE NUMBER or the PIN.
 *
 * Tests:
 * 1. Documented phone (9647802999569) + documented PIN (1234) — baseline
 * 2. Documented phone (9647802999569) + random PIN (9876) — should also fail if PIN is wrong
 * 3. Random phone (9647800000000) + documented PIN (1234) — if phone is unregistered, different error
 * 4. Merchant phone (9647835077893) + documented PIN (1234) — merchant as payer (unusual)
 *
 * Also tests:
 * 5. Try to retrieve the test wallet info via the inquiry API
 *    (to check if the customer wallet is still active in UAT)
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

async function tryCombination(label, phone, pin, otp = '1111') {
  log(`\n=== ${label} ===`);
  log(`Phone: ${phone}, PIN: ${pin}, OTP: ${otp}`);

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
    body: JSON.stringify({ transactionId, phone, pin, otp }),
  });
  const body = await res.json();

  fs.writeFileSync(path.join(OUT_DIR, `diag-${label.replace(/\s+/g, '_')}-${TS}.json`), JSON.stringify(body, null, 2));

  const processingJwt = decodeJwtFromUrl(body?.steps?.processing?.body?.url);
  const payJwt = decodeJwtFromUrl(body?.steps?.pay?.body?.url);
  const finalBody = body?.steps?.finalCheck?.body;

  log(`  Processing: success=${body?.steps?.processing?.body?.success}, msg=${processingJwt?.msg || 'N/A'}`);
  log(`  Pay: success=${body?.steps?.pay?.body?.success}, msg=${payJwt?.msg || 'N/A'}`);
  log(`  Final: status=${finalBody?.status}, due=${finalBody?.due}, from=${finalBody?.from}`);

  return {
    label,
    phone,
    pin,
    otp,
    transactionId,
    processingMsg: processingJwt?.msg,
    payMsg: payJwt?.msg,
    finalStatus: finalBody?.status,
    finalDue: finalBody?.due,
    finalFrom: finalBody?.from,
  };
}

async function main() {
  log('Diagnostic test: Is the issue the phone number or the PIN?');

  const results = [];

  // Test 1: Documented credentials (baseline)
  results.push(await tryCombination('Documented phone + PIN 1234', '9647802999569', '1234'));
  await sleep(5000);

  // Test 2: Documented phone + different PIN
  results.push(await tryCombination('Documented phone + PIN 9876', '9647802999569', '9876'));
  await sleep(5000);

  // Test 3: Random unregistered phone + documented PIN
  results.push(await tryCombination('Random phone + PIN 1234', '9647800000000', '1234'));
  await sleep(5000);

  // Test 4: Merchant phone as payer + documented PIN
  results.push(await tryCombination('Merchant phone as payer + PIN 1234', '9647835077893', '1234'));
  await sleep(5000);

  // Test 5: Try with phone WITHOUT country code (10 digits)
  results.push(await tryCombination('Phone without 964 prefix + PIN 1234', '7802999569', '1234'));

  // Save summary
  const summary = {
    timestamp: ts(),
    results,
    analysis: {
      allReturnWrongCredentials: results.every(r => r?.processingMsg?.includes('Wrong Credentials')),
      phoneIsValid: results.some(r => r?.finalFrom === '9647802999569'),
      pinIsWrong: results.filter(r => r?.phone === '9647802999569').every(r => r?.processingMsg?.includes('Wrong Credentials')),
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, `diagnostic-test-summary-${TS}.json`), JSON.stringify(summary, null, 2));
  log(`\n=== DIAGNOSTIC SUMMARY ===`);
  log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
