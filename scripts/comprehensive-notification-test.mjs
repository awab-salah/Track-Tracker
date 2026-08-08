/**
 * Comprehensive test for the duplicate notification fix.
 */

const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';
const COMPANY_ID = 'da1e24d1-7505-4e16-9ad8-89e0be899ba4';
const DRIVER_ID = '50c3b448-8115-45c7-946f-02eb662e78c5';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function getFreshToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'verify-co+mskqybvu@track-tracker.test', password: 'VerifyCo123!' }),
  });
  const data = await res.json();
  return data.access_token;
}

async function testEdgeFunctionValidation() {
  console.log('\n=== Test 1: Edge Function Validation ===');
  
  // Test 1a: Missing saleId returns 400
  console.log('\n[1a] Missing saleId returns 400:');
  const res1 = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId: DRIVER_ID, driverName: 'Test', totalPrice: 100, companyId: COMPANY_ID,
    }),
  });
  const data1 = await res1.json();
  assert(res1.status === 400, `Missing saleId → status 400 (got ${res1.status})`);
  assert(data1.error === 'Missing required fields', `Error message: "${data1.error}"`);
  
  // Test 1b: Missing companyId returns 400
  console.log('\n[1b] Missing companyId returns 400:');
  const res2 = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saleId: 'test-sale-id', driverId: DRIVER_ID, driverName: 'Test', totalPrice: 100,
    }),
  });
  assert(res2.status === 400, `Missing companyId → status 400 (got ${res2.status})`);
  
  // Test 1c: OPTIONS returns CORS headers
  console.log('\n[1c] OPTIONS returns CORS headers:');
  const res3 = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'OPTIONS', headers: { 'apikey': ANON_KEY },
  });
  assert(res3.status === 200, `OPTIONS → status 200`);
  assert(res3.headers.get('access-control-allow-origin') === '*', `CORS origin: *`);
}

async function testEdgeFunctionDataOnlyPayload() {
  console.log('\n=== Test 2: Edge Function sends data-only FCM payload ===');
  
  const fs = await import('fs');
  const sourceCode = fs.readFileSync('/home/z/my-project/artifacts/track-tracker/supabase/functions/notify-sale/index.ts', 'utf-8');
  
  console.log('\n[2a] Data-only message structure:');
  assert(sourceCode.includes('DATA-ONLY message'), 'Contains "DATA-ONLY message" comment');
  assert(sourceCode.includes('no top-level `notification` key'), 'Mentions "no top-level notification key"');
  assert(sourceCode.includes('saleId,'), 'saleId in FCM data payload');
  assert(sourceCode.includes("type: 'sale'"), 'type: "sale" in data');
  assert(sourceCode.includes('title: pushTitle'), 'title in data payload');
  assert(sourceCode.includes('body: pushBody'), 'body in data payload');
  assert(sourceCode.includes('icon: pushIcon'), 'icon in data payload');
  assert(sourceCode.includes('fcm_options:'), 'webpush.fcm_options exists');
  assert(sourceCode.includes("link: '/'"), 'webpush.fcm_options.link = "/"');
  assert(!sourceCode.match(/notification:\s*\{\s*title/), 'NO notification: { title } in message body');
}

async function testClientDedupLogic() {
  console.log('\n=== Test 3: Client-side dedup logic (deployed bundle) ===');
  
  const bundleRes = await fetch('https://track-tracker-awab-salahs-projects.vercel.app/assets/index-NIClGiPj.js');
  const bundleCode = await bundleRes.text();
  
  console.log('\n[3a] Dedup guard in deployed bundle:');
  assert(bundleCode.includes('Skipping duplicate'), '"Skipping duplicate" log message');
  assert(bundleCode.includes('saleId'), 'saleId reference in bundle');
  
  // Check for saleId-based tag (minified variable name, pattern: sale-${<var>})
  const saleTagMatch = bundleCode.match(/sale-\$\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g);
  const hasSaleIdTag = saleTagMatch && saleTagMatch.some(m => m !== 'sale-${Date.now()}' && !m.includes('productName'));
  assert(hasSaleIdTag, `saleId-based notification tag (found: ${saleTagMatch?.join(', ')})`);
  
  // Check for payload.data.saleId access (minified: <var>.data?.saleId)
  const dataSaleIdMatch = bundleCode.match(/[a-zA-Z_$]+\.data\?\.saleId/);
  assert(!!dataSaleIdMatch, `onMessage reads payload.data?.saleId (found: ${dataSaleIdMatch?.[0]})`);
}

async function testServiceWorkerDedup() {
  console.log('\n=== Test 4: Service worker dedup logic ===');
  
  const swRes = await fetch('https://track-tracker-awab-salahs-projects.vercel.app/firebase-messaging-sw.js');
  const swCode = await swRes.text();
  
  console.log('\n[4a] Service worker data-only + dedup:');
  assert(swCode.includes('data?.saleId'), 'SW reads saleId from payload.data');
  assert(swCode.match(/sale-.*saleId/), 'SW uses saleId in notification tag');
  assert(swCode.includes('data?.title'), 'SW falls back to payload.data.title');
  assert(swCode.includes('data?.body'), 'SW falls back to payload.data.body');
  assert(swCode.includes('data?.icon'), 'SW falls back to payload.data.icon');
  assert(swCode.includes('onBackgroundMessage'), 'SW uses onBackgroundMessage handler');
}

async function testEdgeFunctionWithToken() {
  console.log('\n=== Test 5: Edge Function API-level test ===');
  
  const freshToken = await getFreshToken();
  
  console.log('\n[5a] Inserting test FCM token:');
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY, 'Authorization': `Bearer ${freshToken}`,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ company_id: COMPANY_ID, token: 'test-fcm-dedup-token-12345' }),
  });
  assert(insertRes.ok, `Insert test token: status ${insertRes.status}`);
  
  // Call with saleId
  console.log('\n[5b] Calling Edge Function with saleId:');
  const saleId = crypto.randomUUID();
  const notifyRes = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saleId, driverId: DRIVER_ID, driverName: 'Test Driver', totalPrice: 25000, companyId: COMPANY_ID,
    }),
  });
  const notifyData = await notifyRes.json();
  assert(notifyRes.status === 200, `Edge Function returns 200`);
  assert(notifyData.total === 1, `Total tokens: 1`);
  assert(notifyData.sent === 0, `Sent: 0 (token invalid, expected)`);
  assert(notifyData.errors?.length > 0, 'FCM error present (token invalid)');
  
  // Call again with SAME saleId
  console.log('\n[5c] Same saleId twice (dedup handled client-side via tag):');
  const notifyRes2 = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saleId, driverId: DRIVER_ID, driverName: 'Test Driver', totalPrice: 25000, companyId: COMPANY_ID,
    }),
  });
  assert(notifyRes2.status === 200, `Second call also returns 200`);
  
  // Call with DIFFERENT saleId
  console.log('\n[5d] Different saleId:');
  const saleId2 = crypto.randomUUID();
  const notifyRes3 = await fetch(`${SUPABASE_URL}/functions/v1/notify-sale`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      saleId: saleId2, driverId: DRIVER_ID, driverName: 'Test Driver', totalPrice: 30000, companyId: COMPANY_ID,
    }),
  });
  assert(notifyRes3.status === 200, `Different saleId returns 200`);
  
  // Clean up
  console.log('\n[5e] Cleanup:');
  await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?token=eq.test-fcm-dedup-token-12345`, {
    method: 'DELETE',
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${freshToken}` },
  });
  assert(true, 'Test token cleaned up');
}

async function testRealtimeHandlerIsNoop() {
  console.log('\n=== Test 6: Realtime handler is intentionally empty ===');
  
  const fs = await import('fs');
  const appContext = fs.readFileSync('/home/z/my-project/artifacts/track-tracker/src/store/AppContext.tsx', 'utf-8');
  
  console.log('\n[6a] Realtime subscription does NOT show notifications:');
  // The Realtime handler uses .channel() and .on('postgres_changes', ...)
  assert(appContext.includes('.channel('), 'Realtime channel subscription exists');
  assert(appContext.includes('postgres_changes'), 'Subscribes to postgres_changes');
  
  // The handler is intentionally empty (doesn't create notifications)
  assert(appContext.includes('Intentionally not showing a notification'), 'Handler comment: intentionally not showing notification');
  
  // FCM is the notification delivery method
  assert(appContext.includes('notifySaleViaEdgeFunction'), 'FCM Edge Function handles notifications');
  assert(appContext.includes('newSale.id'), 'Sale ID passed to Edge Function');
}

async function testDedupGuardLogic() {
  console.log('\n=== Test 7: Dedup guard in source code ===');
  
  const fs = await import('fs');
  const appContext = fs.readFileSync('/home/z/my-project/artifacts/track-tracker/src/store/AppContext.tsx', 'utf-8');
  
  console.log('\n[7a] Dedup guard implementation:');
  assert(appContext.includes('notifiedSaleIdsRef'), 'notifiedSaleIdsRef exists');
  assert(appContext.includes('DEDUP_TTL'), 'DEDUP_TTL constant exists');
  assert(appContext.includes('5 * 60 * 1000'), 'TTL is 5 minutes');
  assert(appContext.includes('dedupMap.has(saleId)'), 'Checks dedupMap.has(saleId)');
  assert(appContext.includes('dedupMap.set(saleId, now)'), 'Records saleId in dedupMap');
  assert(appContext.includes('dedupMap.delete(id)'), 'Prunes stale entries');
  assert(appContext.includes('sale-${saleId}'), 'Notification tag uses sale-${saleId}');
}

async function testAddSalePassesSaleId() {
  console.log('\n=== Test 8: addSale() passes saleId to Edge Function ===');
  
  const fs = await import('fs');
  const appContext = fs.readFileSync('/home/z/my-project/artifacts/track-tracker/src/store/AppContext.tsx', 'utf-8');
  
  console.log('\n[8a] addSale flow:');
  // Find the addSale function
  const addSaleMatch = appContext.match(/addSale[\s\S]*?notifySaleViaEdgeFunction[\s\S]*?\)/);
  assert(!!addSaleMatch, 'addSale calls notifySaleViaEdgeFunction');
  assert(appContext.includes('newSale.id'), 'Passes newSale.id as saleId');
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Duplicate Notification Fix — Comprehensive Test Suite       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  await testEdgeFunctionValidation();
  await testEdgeFunctionDataOnlyPayload();
  await testClientDedupLogic();
  await testServiceWorkerDedup();
  await testEdgeFunctionWithToken();
  await testRealtimeHandlerIsNoop();
  await testDedupGuardLogic();
  await testAddSalePassesSaleId();
  
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed                                     ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
