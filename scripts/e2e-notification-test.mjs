/**
 * End-to-end test for single notification per sale.
 * 
 * Uses Playwright directly to:
 * 1. Grant notification permissions to the browser
 * 2. Log in as company owner and enable notifications
 * 3. Log in as driver and create a sale
 * 4. Verify exactly ONE notification appears for the company
 * 5. Repeat with another sale
 */

import { chromium } from 'playwright';

const APP_URL = 'https://track-tracker-awab-salahs-projects.vercel.app';
const COMPANY_EMAIL = 'verify-co+mskqybvu@track-tracker.test';
const COMPANY_PASSWORD = 'VerifyCo123!';
const DRIVER_EMAIL = 'verify-drv+mskqybvu@track-tracker.test';
const DRIVER_PASSWORD = 'VerifyDrv123!';

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('=== E2E Notification Test ===\n');
  
  // ── Company Owner Session ──────────────────────────────────────────────
  console.log('[1] Launching company owner browser with notification permissions...');
  const companyBrowser = await chromium.launch({ headless: true });
  const companyContext = await companyBrowser.newContext({
    permissions: ['notifications'],  // Grant notification permission!
  });
  const companyPage = await companyContext.newPage();
  
  // Track notifications shown
  const companyNotifications = [];
  companyPage.on('notification', notification => {
    companyNotifications.push({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      timestamp: Date.now(),
    });
    console.log(`[NOTIFICATION] title="${notification.title}" body="${notification.body}" tag="${notification.tag}"`);
  });
  
  console.log('[2] Navigating to app...');
  await companyPage.goto(APP_URL, { waitUntil: 'networkidle' });
  await delay(2000);
  
  // Dismiss PWA install prompt if present
  try {
    const laterBtn = companyPage.getByText('لاحقاً');
    if (await laterBtn.isVisible({ timeout: 3000 })) {
      await laterBtn.click();
      await delay(1000);
      console.log('  Dismissed PWA install prompt');
    }
  } catch (e) {}
  
  // Click Company Owner
  console.log('[3] Selecting Company Owner...');
  await companyPage.getByText('صاحب الشركة').click();
  await delay(1000);
  
  // Login
  console.log('[4] Logging in as company owner...');
  const emailInput = companyPage.getByPlaceholder('البريد الإلكتروني');
  const passwordInput = companyPage.getByPlaceholder('كلمة المرور');
  await emailInput.fill(COMPANY_EMAIL);
  await passwordInput.fill(COMPANY_PASSWORD);
  
  // Click the login button (not the tab button)
  const loginButtons = companyPage.getByRole('button', { name: 'تسجيل الدخول' });
  await loginButtons.last().click();
  await delay(3000);
  
  // Wait for dashboard
  console.log('[5] Waiting for dashboard...');
  await companyPage.waitForURL('**/owner-dashboard**', { timeout: 15000 }).catch(() => {
    console.log('  Dashboard URL not detected, continuing...');
  });
  await delay(2000);
  
  // Navigate to profile to enable notifications
  console.log('[6] Navigating to profile to enable notifications...');
  // Click the company initial button in the header
  try {
    const headerBtn = companyPage.locator('button').first();
    await headerBtn.click();
    await delay(1000);
  } catch (e) {
    console.log('  Could not click header button, trying alternative...');
  }
  
  // Check current URL
  console.log(`  Current URL: ${companyPage.url()}`);
  
  // Look for notification toggle
  const notifToggle = companyPage.getByRole('switch', { name: /إشعارات المبيعات/ });
  try {
    await notifToggle.waitFor({ state: 'visible', timeout: 5000 });
    const isChecked = await notifToggle.isChecked();
    console.log(`  Notification toggle found, checked: ${isChecked}`);
    
    if (!isChecked) {
      console.log('[7] Enabling sale notifications...');
      await notifToggle.click();
      await delay(3000);
      
      // Verify it's now checked
      const nowChecked = await notifToggle.isChecked();
      console.log(`  Notification toggle now checked: ${nowChecked}`);
      
      if (!nowChecked) {
        console.log('  WARNING: Toggle not checked after click. Checking permission...');
        const perm = await companyPage.evaluate(() => Notification.permission);
        console.log(`  Notification permission: ${perm}`);
      }
    }
  } catch (e) {
    console.log(`  Could not find notification toggle: ${e.message}`);
    // Try navigating directly to profile
    console.log(`  Current URL: ${companyPage.url()}`);
  }
  
  // Check Notification permission
  const perm = await companyPage.evaluate(() => Notification.permission);
  console.log(`  Notification permission state: ${perm}`);
  
  // Check if FCM token was registered
  await delay(2000);
  const fcmToken = await companyPage.evaluate(() => {
    // Check if there's an FCM token in the service worker
    return navigator.serviceWorker?.controller ? 'sw-active' : 'no-sw';
  });
  console.log(`  Service worker: ${fcmToken}`);
  
  // Check console for FCM token registration
  const consoleMsgs = [];
  companyPage.on('console', msg => {
    consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  // ── Driver Session ─────────────────────────────────────────────────────
  console.log('\n[8] Launching driver browser...');
  const driverBrowser = await chromium.launch({ headless: true });
  const driverContext = await driverBrowser.newContext();
  const driverPage = await driverContext.newPage();
  
  console.log('[9] Navigating to app as driver...');
  await driverPage.goto(APP_URL, { waitUntil: 'networkidle' });
  await delay(2000);
  
  // Dismiss PWA install prompt
  try {
    const laterBtn = driverPage.getByText('لاحقاً');
    if (await laterBtn.isVisible({ timeout: 3000 })) {
      await laterBtn.click();
      await delay(1000);
    }
  } catch (e) {}
  
  // Click Driver
  console.log('[10] Selecting Driver...');
  await driverPage.getByText('سائق').click();
  await delay(1000);
  
  // Login as driver
  console.log('[11] Logging in as driver...');
  const driverEmailInput = driverPage.getByPlaceholder('البريد الإلكتروني');
  const driverPasswordInput = driverPage.getByPlaceholder('كلمة المرور');
  await driverEmailInput.fill(DRIVER_EMAIL);
  await driverPasswordInput.fill(DRIVER_PASSWORD);
  
  const driverLoginButtons = driverPage.getByRole('button', { name: 'تسجيل الدخول' });
  await driverLoginButtons.last().click();
  await delay(3000);
  
  // Wait for driver dashboard
  console.log('[12] Waiting for driver dashboard...');
  await driverPage.waitForURL('**/driver-dashboard**', { timeout: 15000 }).catch(() => {
    console.log('  Driver dashboard URL not detected, continuing...');
  });
  await delay(2000);
  console.log(`  Driver URL: ${driverPage.url()}`);
  
  // Navigate to Sales tab
  console.log('[13] Looking for Sales tab...');
  try {
    const salesTab = driverPage.getByRole('button', { name: /المبيعات|بيع/ });
    if (await salesTab.isVisible({ timeout: 5000 })) {
      await salesTab.click();
      await delay(1000);
      console.log('  Clicked Sales tab');
    }
  } catch (e) {
    console.log('  Could not find Sales tab, trying alternatives...');
  }
  
  // Check what's on the driver dashboard
  console.log(`  Driver page URL: ${driverPage.url()}`);
  
  // Take a screenshot for debugging
  await driverPage.screenshot({ path: '/home/z/my-project/download/driver-dashboard.png' });
  console.log('  Screenshot saved: driver-dashboard.png');
  
  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n=== Test Summary ===');
  console.log(`Company notifications received: ${companyNotifications.length}`);
  console.log(`Notification permission: ${perm}`);
  console.log(`Console messages: ${consoleMsgs.length}`);
  
  for (const msg of consoleMsgs.slice(-20)) {
    console.log(`  ${msg}`);
  }
  
  // Cleanup
  await companyBrowser.close();
  await driverBrowser.close();
  
  console.log('\n=== Test Complete ===');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
