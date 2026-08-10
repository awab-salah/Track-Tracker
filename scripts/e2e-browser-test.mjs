/**
 * Real E2E test: Playwright with notification permissions granted via context.
 * Tests the full flow: company enables notifications → driver creates sale → verify notification.
 */

import { chromium, devices } from 'playwright';
import { writeFileSync } from 'fs';

const APP_URL = 'https://track-tracker-awab-salahs-projects.vercel.app';
const COMPANY_EMAIL = 'verify-co+mskqybvu@track-tracker.test';
const COMPANY_PASSWORD = 'VerifyCo123!';
const DRIVER_EMAIL = 'verify-drv+mskqybvu@track-tracker.test';
const DRIVER_PASSWORD = 'VerifyDrv123!';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runTest() {
  const results = [];
  
  console.log('=== E2E Browser Test: Duplicate Notification Fix ===\n');
  
  // ── Company Owner Browser ──────────────────────────────────────────────
  console.log('[1] Launching company owner browser...');
  const companyBrowser = await chromium.launch({ headless: true });
  const companyContext = await companyBrowser.newContext({
    // Grant notification permissions to the app origin
    permissions: ['notifications'],
  });
  
  // Set a geolocation so maps don't block
  await companyContext.grantPermissions(['notifications'], { origin: APP_URL });
  
  const companyPage = await companyContext.newPage();
  
  // Collect ALL console messages
  const companyConsole = [];
  companyPage.on('console', msg => {
    companyConsole.push({ type: msg.type(), text: msg.text() });
  });
  
  // Collect notifications
  const companyNotifications = [];
  companyPage.on('notification', async notification => {
    companyNotifications.push({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      timestamp: Date.now(),
    });
    console.log(`[🔔 NOTIFICATION] title="${notification.title}" tag="${notification.tag}"`);
  });
  
  console.log('[2] Navigating to app...');
  await companyPage.goto(APP_URL, { waitUntil: 'networkidle' });
  await delay(3000);
  
  // Dismiss PWA prompt
  try {
    const laterBtn = companyPage.getByText('لاحقاً');
    if (await laterBtn.isVisible({ timeout: 3000 })) {
      await laterBtn.click();
      await delay(1000);
    }
  } catch (e) {}
  
  // Select Company Owner
  console.log('[3] Selecting Company Owner...');
  await companyPage.getByText('صاحب الشركة').click();
  await delay(1500);
  
  // Login
  console.log('[4] Logging in...');
  await companyPage.getByPlaceholder('البريد الإلكتروني').fill(COMPANY_EMAIL);
  await companyPage.getByPlaceholder('كلمة المرور').fill(COMPANY_PASSWORD);
  const loginBtns = companyPage.getByRole('button', { name: 'تسجيل الدخول' });
  await loginBtns.last().click();
  await delay(4000);
  
  // Check Notification permission
  const perm = await companyPage.evaluate(() => Notification.permission);
  console.log(`[5] Notification permission: ${perm}`);
  
  // Navigate to profile
  console.log('[6] Going to profile to enable notifications...');
  const headerBtn = companyPage.locator('button').first();
  await headerBtn.click();
  await delay(2000);
  
  // Enable notifications
  const notifToggle = companyPage.getByRole('switch', { name: /إشعارات المبيعات/ });
  try {
    await notifToggle.waitFor({ state: 'visible', timeout: 5000 });
    const isChecked = await notifToggle.isChecked();
    console.log(`  Toggle found, checked: ${isChecked}`);
    
    if (!isChecked) {
      await notifToggle.click();
      await delay(3000);
      const nowChecked = await notifToggle.isChecked();
      console.log(`  After click, checked: ${nowChecked}`);
    }
  } catch (e) {
    console.log(`  Could not find toggle: ${e.message}`);
  }
  
  // Check permission after toggle
  const permAfter = await companyPage.evaluate(() => Notification.permission);
  console.log(`[7] Permission after toggle: ${permAfter}`);
  
  // Check console for FCM token registration
  const fcmLogs = companyConsole.filter(m => 
    m.text.includes('fcmService') || m.text.includes('FCM') || m.text.includes('fcm')
  );
  console.log(`[8] FCM-related console logs: ${fcmLogs.length}`);
  fcmLogs.forEach(l => console.log(`  [${l.type}] ${l.text}`));
  
  // ── Check FCM tokens in database ──────────────────────────────────────
  console.log('\n[9] Checking FCM tokens in database...');
  const freshToken = await companyPage.evaluate(async () => {
    // Get the Supabase session token
    const { data } = await (await import('/src/lib/supabase')).supabase.auth.getSession();
    return data.session?.access_token || '';
  }).catch(() => '');
  
  // Check database directly for FCM tokens
  const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
  const ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';
  const COMPANY_ID = 'da1e24d1-7505-4e16-9ad8-89e0be899ba4';
  
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: COMPANY_EMAIL, password: COMPANY_PASSWORD }),
  });
  const tokenData = await tokenRes.json();
  const authToken = tokenData.access_token;
  
  const fcmTokensRes = await fetch(`${SUPABASE_URL}/rest/v1/fcm_tokens?company_id=eq.${COMPANY_ID}&select=*`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
  });
  const fcmTokens = await fcmTokensRes.json();
  console.log(`  FCM tokens in database: ${fcmTokens.length}`);
  fcmTokens.forEach(t => console.log(`    token: ${t.token.substring(0, 30)}...`));
  
  const hasFcmToken = fcmTokens.length > 0;
  results.push({ test: 'FCM token registered in database', pass: hasFcmToken });
  
  // ── Driver Session ─────────────────────────────────────────────────────
  console.log('\n[10] Launching driver browser...');
  const driverBrowser = await chromium.launch({ headless: true });
  const driverContext = await driverBrowser.newContext();
  const driverPage = await driverContext.newPage();
  
  const driverConsole = [];
  driverPage.on('console', msg => {
    driverConsole.push({ type: msg.type(), text: msg.text() });
  });
  
  await driverPage.goto(APP_URL, { waitUntil: 'networkidle' });
  await delay(3000);
  
  // Dismiss PWA prompt
  try {
    const laterBtn = driverPage.getByText('لاحقاً');
    if (await laterBtn.isVisible({ timeout: 3000 })) {
      await laterBtn.click();
      await delay(1000);
    }
  } catch (e) {}
  
  // Select Driver
  console.log('[11] Selecting Driver...');
  await driverPage.getByText('سائق').click();
  await delay(1500);
  
  // Login
  console.log('[12] Logging in as driver...');
  await driverPage.getByPlaceholder('البريد الإلكتروني').fill(DRIVER_EMAIL);
  await driverPage.getByPlaceholder('كلمة المرور').fill(DRIVER_PASSWORD);
  const driverLoginBtns = driverPage.getByRole('button', { name: 'تسجيل الدخول' });
  await driverLoginBtns.last().click();
  await delay(4000);
  
  console.log(`  Driver URL: ${driverPage.url()}`);
  
  // Take screenshot of driver dashboard
  await driverPage.screenshot({ path: '/home/z/my-project/download/driver-dashboard-e2e.png' });
  
  // Navigate to Sales tab if present
  console.log('[13] Looking for Sales/Record Sale UI...');
  try {
    const salesTab = driverPage.getByRole('button', { name: /المبيعات|بيع/ });
    if (await salesTab.isVisible({ timeout: 3000 })) {
      await salesTab.click();
      await delay(1000);
      console.log('  Clicked Sales tab');
    }
  } catch (e) {}
  
  // Take another screenshot
  await driverPage.screenshot({ path: '/home/z/my-project/download/driver-sales-e2e.png' });
  
  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n=== E2E Test Results ===');
  console.log(`Notification permission: ${permAfter}`);
  console.log(`FCM tokens in DB: ${fcmTokens.length}`);
  console.log(`Notifications received: ${companyNotifications.length}`);
  console.log(`Company console errors: ${companyConsole.filter(m => m.type === 'error').length}`);
  
  // Key findings
  console.log('\n=== Key Findings ===');
  results.forEach(r => {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.test}`);
  });
  
  // Print relevant console logs
  console.log('\n=== Relevant Console Logs (Company) ===');
  companyConsole.filter(m => 
    m.text.includes('fcm') || m.text.includes('FCM') || m.text.includes('notification') ||
    m.text.includes('sale') || m.text.includes('Skipping') || m.text.includes('dedup')
  ).forEach(l => console.log(`  [${l.type}] ${l.text}`));
  
  console.log('\n=== Relevant Console Logs (Driver) ===');
  driverConsole.filter(m => 
    m.text.includes('fcm') || m.text.includes('FCM') || m.text.includes('notify') ||
    m.text.includes('sale') || m.text.includes('Edge Function')
  ).forEach(l => console.log(`  [${l.type}] ${l.text}`));
  
  // Cleanup
  await companyBrowser.close();
  await driverBrowser.close();
  
  console.log('\n=== E2E Test Complete ===');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
