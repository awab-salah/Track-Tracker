#!/usr/bin/env node
/**
 * Test ZainCash UAT with specific credentials.
 * Credentials: MSISDN 9647802999569, PIN 1111, OTP 11111
 */

const BASE = 'https://track-tracker-app.vercel.app/api';
const TX = '6a9737f5ead41b8484191c';

async function step(label, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('[' + label + '] ' + res.status + ' ' + text.substring(0, 300));
  try { return JSON.parse(text); } catch { return { error: text }; }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== Test with MSISDN 9647802999569, PIN 1111, OTP 11111 ===');

  // Step 1: Verify transaction is still pending
  console.log('Step 1: Verify transaction...');
  const v1 = await step('verify', BASE + '/zaincash/verify?transactionId=' + TX);
  console.log('  Status:', v1.status);
  console.log('  Body:', JSON.stringify(v1).substring(0, 200));
  if (v1.status !== 200) { console.error('Verify failed'); return; }
  console.log('  Transaction status:', v1.status);
  console.log('  Processing should be: pending');
  await sleep(2000);

  // Step 2: Processing
  console.log('Step 2: Processing...');
  const processing = await step('processing', BASE + '/zaincash/debug-complete-payment', {
    transactionId: TX,
    phone: '9647802999569',
    pin: '1111',
    otp: '11111',
  });
  console.log('  Processing result (first 200 chars):', processing?.substring(0, 200));
  // Decode JWT from url field if present
  if (processing?.body?.url) {
    try {
      const token = new URL(processing.body.url).searchParams.get('token');
      if (token) {
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        console.log('  Processing JWT payload:', JSON.stringify(payload));
      }
    }
  }
  await sleep(2000);

  // Step 3: Pay (OTP)
  console.log('Step 3: Pay (OTP)...');
  const pay = await step('pay', BASE + '/zaincash/debug-complete-payment', {
    transactionId: TX,
    phone: '9647802999569',
    pin: '1111',
    otp: '11111',
  });
  console.log('  Pay result (first 200 chars):', pay?.substring(0, 200));
  // Decode JWT from url field if present
  if (pay?.body?.url) {
    try {
      const token = new URL(pay.body.url).searchParams.get('token');
      if (token) {
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        console.log('  Pay JWT payload:', JSON.stringify(payload));
      }
    }
  }
  await sleep(2000);

  // Step 4: Final verification
  console.log('Step 4: Final verification...');
  const v2 = await step('verify', BASE + '/zaincash/verify?transactionId=' + TX);
  console.log('  Final status:', v2.status);
  console.log('  Amount:', v2.details?.amount);
  console.log('  ServiceType:', v2.details?.serviceType);
  console.log('  Status:', v2.details?.status);
  if (v2.details?.due) console.log('  Due:', v2.details.due);
  if (v2.details?.from) console.log('  From (payer):', v2.details.from);

  // Step 5: Check payment_records
  console.log('Step 5: Check payment_records via RPC...');
  const prRes = await fetch('https://qexafenusvjkyzfhtpda.supabase.co/rest/v1/rpc/get_payment_record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs', Authorization: 'Bearer sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs' },
    body: JSON.stringify({ p_id: TX }),
  });
  console.log('  Payment record:', await prRes.json());

  // Step 6: Check company subscription
  console.log('Step 6: Check company subscription...');
  const coRes = await fetch(`https://qexafenusvjkyzfhtpda.supabase.co/rest/v1/companies?name=eq.${encodeURIComponent('Smoke Test Co 2')}&select=id,name,subscription_active`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs', Authorization: 'Bearer sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs' },
  });
  console.log('  Company record:', await coRes.json());
  console.log('\n=== DONE ===');
})();
step(label, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log('[' + label + '] ' + res.status + ' ' + text.substring(0, 200));
  try { return JSON.parse(text); } catch { return { error: text }; }
}
