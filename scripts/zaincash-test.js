/**
 * Comprehensive ZainCash Payment Flow Test Suite
 * Tests all 10 payment flow areas against production
 */

const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';
const PRODUCTION_URL = 'https://track-tracker-app.vercel.app';
const TEST_COMPANY = 'Smoke Test Co';

let results = [];
let testTransactionId = null;
let testOrderId = null;

function log(testName, passed, details) {
  results.push({ test: testName, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${details}`);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data, headers: Object.fromEntries(res.headers.entries()) };
}

async function supabaseRPC(fn, params) {
  return fetchJSON(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });
}

async function supabaseSelect(table, query) {
  return fetchJSON(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 1: Payment creation via /api/zaincash/create
// ══════════════════════════════════════════════════════════════════════════════
async function test1_paymentCreation() {
  console.log('\n═══ Test 1: Payment Creation ═══');
  
  const uniqueTs = Date.now();
  const res = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      planId: 'plan-10',
      amount: 14000,
      companyId: TEST_COMPANY,
    }),
  });

  if (res.ok && res.data.transactionId && res.data.redirectUrl && res.data.orderId) {
    testTransactionId = res.data.transactionId;
    testOrderId = res.data.orderId;
    log('1a. Create returns transactionId', true, `ID: ${res.data.transactionId}`);
    log('1b. Create returns redirectUrl', true, `URL: ${res.data.redirectUrl.substring(0, 60)}...`);
    log('1c. Create returns orderId', true, `Order: ${res.data.orderId}`);
    log('1d. Redirect URL points to ZainCash', 
      res.data.redirectUrl.includes('zaincash.iq'), 
      `Contains 'zaincash.iq': ${res.data.redirectUrl.includes('zaincash.iq')}`);
  } else {
    log('1a. Create payment', false, `Status: ${res.status}, Data: ${JSON.stringify(res.data)}`);
  }
  
  // Test with missing fields
  const badRes = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'plan-10' }), // missing amount, companyId
  });
  log('1e. Rejects missing fields', badRes.status === 400, `Status: ${badRes.status}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 2: payment_records INSERT (verify record was stored)
// ══════════════════════════════════════════════════════════════════════════════
async function test2_paymentRecordsInsert() {
  console.log('\n═══ Test 2: payment_records INSERT ═══');
  
  if (!testTransactionId) {
    log('2a. Payment record stored', false, 'No transaction ID from test 1');
    return;
  }

  // Wait a moment for DB write
  await new Promise(r => setTimeout(r, 1000));
  
  // Use RPC to read the record (bypasses RLS)
  const res = await supabaseRPC('get_payment_record', { p_id: testTransactionId });
  
  if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
    const record = res.data[0];
    log('2a. Payment record exists in DB', true, `ID: ${record.id}`);
    log('2b. Status is pending', record.status === 'pending', `Status: ${record.status}`);
    log('2c. company_id matches', record.company_id === TEST_COMPANY, `company_id: ${record.company_id}`);
    log('2d. plan_id is plan-10', record.plan_id === 'plan-10', `plan_id: ${record.plan_id}`);
    log('2e. amount is 14000', record.amount === 14000, `amount: ${record.amount}`);
    log('2f. order_id matches', record.order_id === testOrderId, `order_id match: ${record.order_id === testOrderId}`);
    log('2g. created_at is set', !!record.created_at, `created_at: ${record.created_at}`);
  } else {
    log('2a. Payment record in DB', false, `Response: ${JSON.stringify(res.data)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 3: Transaction verification via /api/zaincash/verify
// ══════════════════════════════════════════════════════════════════════════════
async function test3_transactionVerification() {
  console.log('\n═══ Test 3: Transaction Verification ═══');
  
  if (!testTransactionId) {
    log('3a. Verify endpoint', false, 'No transaction ID');
    return;
  }

  const res = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/verify?transactionId=${testTransactionId}`);
  
  log('3a. Verify returns 200', res.ok, `Status: ${res.status}`);
  log('3b. Verify returns transactionId', res.data?.transactionId === testTransactionId, 
    `Returned: ${res.data?.transactionId}`);
  log('3c. Verify returns status', !!res.data?.status, `Status: ${res.data?.status}`);
  log('3d. Status is pending (not yet paid)', res.data?.status === 'pending', 
    `Status: ${res.data?.status}`);
  
  // Test with invalid transaction ID
  const badRes = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/verify?transactionId=invalid_id_12345`);
  log('3e. Invalid TX ID returns error', !badRes.ok, `Status: ${badRes.status}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 4: Callback processing via /api/zaincash/callback
// ══════════════════════════════════════════════════════════════════════════════
async function test4_callbackProcessing() {
  console.log('\n═══ Test 4: Callback Processing ═══');
  
  // Test callback without token (simulates user cancellation)
  const cancelRes = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/callback`, {
    method: 'GET',
    headers: { 'Accept': 'text/html' },
  });
  log('4a. Callback without token returns HTML', cancelRes.ok, `Status: ${cancelRes.status}`);
  log('4b. Cancel response contains Arabic text', 
    typeof cancelRes.data === 'string' && cancelRes.data.includes('فشلت'), 
    'Contains cancellation message');
  
  // Test POST callback with missing transactionId
  const postRes = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  log('4c. POST callback without TX ID returns error', 
    postRes.ok && postRes.data?.error, 
    `Response: ${JSON.stringify(postRes.data)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 5: payment_records UPDATE via RPC
// ══════════════════════════════════════════════════════════════════════════════
async function test5_paymentRecordsUpdate() {
  console.log('\n═══ Test 5: payment_records UPDATE ═══');
  
  if (!testTransactionId) {
    log('5a. Update payment record', false, 'No transaction ID');
    return;
  }

  // Update to completed
  const res = await supabaseRPC('update_payment_record', { 
    p_id: testTransactionId, 
    p_status: 'completed' 
  });
  
  log('5a. RPC update_payment_record returns true', res.data === true, `Result: ${JSON.stringify(res.data)}`);
  
  // Verify the update
  const checkRes = await supabaseRPC('get_payment_record', { p_id: testTransactionId });
  if (checkRes.ok && Array.isArray(checkRes.data) && checkRes.data.length > 0) {
    log('5b. Status updated to completed', checkRes.data[0].status === 'completed', 
      `Status: ${checkRes.data[0].status}`);
    log('5c. updated_at is set', !!checkRes.data[0].updated_at, 
      `updated_at: ${checkRes.data[0].updated_at}`);
  } else {
    log('5b. Status update verification', false, 'Could not read record');
  }
  
  // Reset back to pending for further tests
  await supabaseRPC('update_payment_record', { p_id: testTransactionId, p_status: 'pending' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 6: Duplicate callback / Idempotency
// ══════════════════════════════════════════════════════════════════════════════
async function test6_idempotency() {
  console.log('\n═══ Test 6: Idempotency ═══');
  
  if (!testTransactionId) {
    log('6a. Idempotency test', false, 'No transaction ID');
    return;
  }
  
  // First, mark the payment as completed
  await supabaseRPC('update_payment_record', { p_id: testTransactionId, p_status: 'completed' });
  
  // Now send a POST callback for the same transaction (should be idempotent)
  const res = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: testTransactionId, companyId: TEST_COMPANY }),
  });
  
  log('6a. Duplicate callback handled', res.ok, `Status: ${res.status}`);
  log('6b. Callback indicates idempotent or already processed', 
    res.data?.status === 'completed' || res.data?._message?.includes('idempotent'),
    `Status: ${res.data?.status}, Message: ${res.data?._message}`);
  
  // Reset back to pending
  await supabaseRPC('update_payment_record', { p_id: testTransactionId, p_status: 'pending' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 7: Subscription activation logic
// ══════════════════════════════════════════════════════════════════════════════
async function test7_subscriptionActivation() {
  console.log('\n═══ Test 7: Subscription Activation ═══');
  
  // Check that companies table has subscription_active column
  const res = await supabaseSelect('companies', 'name,subscription_active&limit=5');
  
  log('7a. companies table queryable', res.ok, `Status: ${res.status}`);
  if (res.ok && Array.isArray(res.data)) {
    log('7b. Companies have subscription_active field', 
      res.data.length > 0 && 'subscription_active' in res.data[0],
      `Sample: ${JSON.stringify(res.data[0])}`);
  }
  
  // Test the activate_subscription RPC
  const rpcRes = await supabaseRPC('activate_subscription', { p_activation_code: 'track1' });
  log('7c. activate_subscription RPC exists', 
    !rpcRes.data?.message?.includes('Could not find'), 
    `Response: ${JSON.stringify(rpcRes.data)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 8: Pending payment handling
// ══════════════════════════════════════════════════════════════════════════════
async function test8_pendingPaymentHandling() {
  console.log('\n═══ Test 8: Pending Payment Handling ═══');
  
  if (!testTransactionId) {
    log('8a. Pending handling test', false, 'No transaction ID');
    return;
  }
  
  // Payment is currently "pending" - verify should return pending
  const verifyRes = await fetchJSON(`${PRODUCTION_URL}/api/zaincash/verify?transactionId=${testTransactionId}`);
  
  log('8a. Verify returns status for pending payment', verifyRes.ok, `Status: ${verifyRes.status}`);
  log('8b. Pending payment status is not completed', 
    verifyRes.data?.status !== 'completed', 
    `Status: ${verifyRes.data?.status}`);
  
  // Test that pending payment record stays pending (not auto-completed)
  const recordRes = await supabaseRPC('get_payment_record', { p_id: testTransactionId });
  if (recordRes.ok && Array.isArray(recordRes.data) && recordRes.data.length > 0) {
    log('8c. Payment record stays pending', recordRes.data[0].status === 'pending',
      `Status: ${recordRes.data[0].status}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 9: Failed payment handling
// ══════════════════════════════════════════════════════════════════════════════
async function test9_failedPaymentHandling() {
  console.log('\n═══ Test 9: Failed Payment Handling ═══');
  
  if (!testTransactionId) {
    log('9a. Failed handling test', false, 'No transaction ID');
    return;
  }
  
  // Mark as failed via RPC
  const updateRes = await supabaseRPC('update_payment_record', { 
    p_id: testTransactionId, 
    p_status: 'failed' 
  });
  log('9a. Can mark payment as failed', updateRes.data === true, `Result: ${JSON.stringify(updateRes.data)}`);
  
  // Verify it was updated
  const recordRes = await supabaseRPC('get_payment_record', { p_id: testTransactionId });
  if (recordRes.ok && Array.isArray(recordRes.data) && recordRes.data.length > 0) {
    log('9b. Payment record shows failed', recordRes.data[0].status === 'failed',
      `Status: ${recordRes.data[0].status}`);
  }
  
  // Reset to pending
  await supabaseRPC('update_payment_record', { p_id: testTransactionId, p_status: 'pending' });
}

// ══════════════════════════════════════════════════════════════════════════════
// Test 10: sessionStorage/polling behavior
// ══════════════════════════════════════════════════════════════════════════════
async function test10_sessionStoragePolling() {
  console.log('\n═══ Test 10: sessionStorage/Polling ═══');
  
  // We can't directly test sessionStorage from server, but we can verify:
  // 1. The verify endpoint works and returns consistent responses
  // 2. Multiple verify calls don't cause issues
  
  if (!testTransactionId) {
    log('10a. Polling test', false, 'No transaction ID');
    return;
  }
  
  // Simulate multiple verify calls (as the frontend would do)
  const calls = [];
  for (let i = 0; i < 3; i++) {
    calls.push(fetchJSON(`${PRODUCTION_URL}/api/zaincash/verify?transactionId=${testTransactionId}`));
  }
  
  const responses = await Promise.all(calls);
  const allOk = responses.every(r => r.ok);
  const allPending = responses.every(r => r.data?.status === 'pending');
  
  log('10a. Multiple verify calls all succeed', allOk, `All OK: ${allOk}`);
  log('10b. All return consistent pending status', allPending, `All pending: ${allPending}`);
  log('10c. No rate limiting or errors on repeated calls', 
    !responses.some(r => r.status === 429), 
    'No 429 responses');
}

// ══════════════════════════════════════════════════════════════════════════════
// Extra: Table structure and RLS verification
// ══════════════════════════════════════════════════════════════════════════════
async function testExtra_tableStructure() {
  console.log('\n═══ Extra: Table Structure Verification ═══');
  
  // Verify all expected columns exist
  const columns = ['id', 'order_id', 'company_id', 'plan_id', 'amount', 'status', 'created_at', 'updated_at'];
  for (const col of columns) {
    const res = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records?select=${col}&limit=1`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    log(`Extra. Column '${col}' exists`, res.ok, `Status: ${res.status}`);
  }
  
  // Verify non-existent column fails
  const badCol = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records?select=nonexistent&limit=1`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  log('Extra. Non-existent column rejected', !badCol.ok, `Status: ${badCol.status}`);
  
  // Verify RLS blocks direct INSERT with anon key
  const insertRes = await fetchJSON(`${SUPABASE_URL}/rest/v1/payment_records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      id: 'rls-test-' + Date.now(),
      order_id: 'test',
      company_id: 'test',
      plan_id: 'plan-10',
      amount: 1,
      status: 'pending',
    }),
  });
  log('Extra. RLS blocks anon INSERT', !insertRes.ok, `Status: ${insertRes.status}, Error: ${JSON.stringify(insertRes.data)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Main runner
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  ZainCash Payment Flow - Comprehensive Test Suite');
  console.log('  Production: ' + PRODUCTION_URL);
  console.log('  Supabase:   ' + SUPABASE_URL);
  console.log('  Date:       ' + new Date().toISOString());
  console.log('════════════════════════════════════════════════════════════════');
  
  try {
    await test1_paymentCreation();
    await test2_paymentRecordsInsert();
    await test3_transactionVerification();
    await test4_callbackProcessing();
    await test5_paymentRecordsUpdate();
    await test6_idempotency();
    await test7_subscriptionActivation();
    await test8_pendingPaymentHandling();
    await test9_failedPaymentHandling();
    await test10_sessionStoragePolling();
    await testExtra_tableStructure();
  } catch (err) {
    console.error('Test suite error:', err);
  }
  
  // Summary
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('');
  
  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.test}: ${r.details}`);
    });
  }
  
  console.log('\nAll results:');
  results.forEach(r => {
    console.log(`  ${r.passed ? '✅' : '❌'} ${r.test}: ${r.details}`);
  });
  
  // Output JSON for parsing
  console.log('\n---JSON_OUTPUT---');
  console.log(JSON.stringify({
    total, passed, failed,
    testTransactionId,
    testOrderId,
    results,
  }, null, 2));
}

main().catch(console.error);
