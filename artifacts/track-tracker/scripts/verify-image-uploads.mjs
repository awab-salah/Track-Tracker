// End-to-end verification of the image-upload fix.
//
// Signs up a real test company + a real test driver on the REAL Supabase
// project (qexafenusvjkyzfhtpda.supabase.co), then exercises both upload
// flows end-to-end:
//
//   Flow A — Company logo upload:
//     1. Sign up company → handle_new_user trigger creates companies row
//     2. Resolve the new company's id + auth_user_id
//     3. Upload a PNG to `avatars/{authUid}/company-{ts}.png`
//     4. UPDATE companies.logo_url = publicUrl
//     5. Re-fetch company → verify logo_url persisted
//
//   Flow B — Driver avatar + receipt upload:
//     1. Resolve the company's join code
//     2. Validate join code via validate_join_code RPC
//     3. Sign up driver → handle_new_user creates drivers row
//     4. Upload a PNG to `avatars/{driverAuthUid}/driver-{ts}.png`
//     5. UPDATE drivers.profile_picture_url = publicUrl
//     6. Re-fetch driver → verify profile_picture_url persisted
//     7. Create a sale with a receipt PNG → upload to `receipts/...`
//     8. INSERT sales row with receipt_image_url = publicUrl
//     9. Re-fetch sales → verify receipt_image_url persisted
//
// This mirrors exactly what the React app does in
//   src/pages/ProfilePage.tsx        (Flow A)
//   src/pages/DriverProfilePage.tsx  (Flow B, step 4-6)
//   src/components/driver/SalesTab.tsx (Flow B, step 7-9)
//
// Expected output BEFORE storage_setup.sql is applied:
//   Flow A step 3: 403 RLS error
//   Flow A step 5: SUCCEEDS (companies RLS allows owner to UPDATE logo_url)
//   Flow B step 4: 403 RLS error
//   Flow B step 6: SUCCEEDS (drivers RLS allows owner to UPDATE profile_picture_url)
//   Flow B step 7: 404 bucket not found (receipts bucket doesn't exist)
//   Flow B step 9: receipt_image_url = null in DB
//
// Expected output AFTER storage_setup.sql is applied:
//   All steps SUCCEED — both image URLs persist after re-fetch.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

// Minimal 1×1 PNG (8-byte payload + headers) — valid PNG, tiny.
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
  '0d49444154789c63000100000005000100c0a0f5370000000049454e44ae426082',
  'hex'
);
function pngBlob() {
  return new Blob([PNG_BYTES], { type: 'image/png' });
}

const baseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function authedClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function publicUrlFor(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${label}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++; else fail++;
}

// ── Flow A: Company logo upload ──────────────────────────────────────────────
async function flowA() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('Flow A — Company logo upload (ProfilePage.tsx → updateLogo → companies.logo_url)');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const stamp = Date.now().toString(36);
  const email = `e2e-co+${stamp}@track-tracker.test`;
  const password = 'E2ECoPass123!';
  const joinCode = `E2EC${stamp.slice(-3).toUpperCase()}`;
  const companyName = `E2E Co ${stamp}`;

  console.log('\nStep A1 — Sign up company');
  const { data: signUp, error: signUpErr } = await baseClient.auth.signUp({
    email, password,
    options: { data: { role: 'company', companyName, joinCode } },
  });
  if (signUpErr || !signUp.session) {
    check('A1 signUp', false, signUpErr?.message ?? 'no session');
    return;
  }
  check('A1 signUp', true, `authUid=${signUp.user.id}`);
  const co = authedClient(signUp.session.access_token);

  console.log('\nStep A2 — Resolve company row (handle_new_user trigger should have created it)');
  const { data: companyRow, error: cErr } = await co
    .from('companies').select('id, name, logo_url, join_code')
    .eq('auth_user_id', signUp.user.id).single();
  if (cErr) {
    check('A2 fetch company', false, cErr.message);
    return;
  }
  check('A2 fetch company', true, `id=${companyRow.id} joinCode=${companyRow.join_code}`);

  console.log('\nStep A3 — Upload PNG to avatars bucket at path "{authUid}/company-{ts}.png"');
  const logoPath = `${signUp.user.id}/company-${stamp}.png`;
  const upA = await co.storage.from('avatars').upload(logoPath, pngBlob(), {
    contentType: 'image/png', upsert: true,
  });
  if (upA.error) {
    check('A3 upload', false, `${upA.error.statusCode ?? '??'} ${upA.error.message}`);
  } else {
    check('A3 upload', true, `path=${upA.data.path}`);
  }

  const logoUrl = upA.data ? publicUrlFor('avatars', upA.data.path) : 'https://example.com/fallback.png';

  console.log('\nStep A4 — UPDATE companies.logo_url = publicUrl (RLS: companies_owner)');
  const { error: updErr } = await co.from('companies')
    .update({ logo_url: logoUrl }).eq('id', companyRow.id);
  check('A4 update companies.logo_url', !updErr, updErr?.message ?? '');

  console.log('\nStep A5 — Re-fetch company (simulates page refresh)');
  const { data: refetched, error: refErr } = await co
    .from('companies').select('logo_url').eq('id', companyRow.id).single();
  if (refErr) {
    check('A5 re-fetch', false, refErr.message);
  } else {
    const persisted = refetched.logo_url === logoUrl;
    check('A5 logo_url persisted after refresh', persisted,
      `expected=${logoUrl} got=${refetched.logo_url}`);
  }

  // Verify the public URL is fetchable (public read on avatars bucket)
  if (upA.data) {
    console.log('\nStep A6 — Verify the public URL is fetchable via HTTP GET');
    const r = await fetch(logoUrl);
    const bytes = await r.arrayBuffer();
    check('A6 GET publicUrl', r.ok && bytes.byteLength > 0, `HTTP ${r.status} ${bytes.byteLength} bytes`);
  }

  return { companyRow, joinCode, accessToken: signUp.session.access_token, signUp };
}

// ── Flow B: Driver avatar + receipt upload ───────────────────────────────────
async function flowB(flowA) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('Flow B — Driver avatar + receipt upload (DriverProfilePage + SalesTab)');
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (!flowA) { console.log('Skipped (Flow A failed)'); return; }

  const stamp = Date.now().toString(36);
  const email = `e2e-drv+${stamp}@track-tracker.test`;
  const password = 'E2EDrvPass123!';
  const fullName = `E2E Driver ${stamp}`;
  const vehicleNumber = `E2E-${stamp.slice(-4).toUpperCase()}`;

  console.log('\nStep B1 — Validate join code via RPC (validate_join_code)');
  const { data: rpcData, error: rpcErr } = await baseClient.rpc('validate_join_code', {
    p_join_code: flowA.joinCode,
  });
  if (rpcErr) {
    check('B1 validate_join_code', false, rpcErr.message);
    return;
  }
  const rows = rpcData || [];
  if (rows.length === 0) {
    check('B1 validate_join_code', false, 'no rows returned');
    return;
  }
  check('B1 validate_join_code', true, `companyId=${rows[0].company_id}`);

  console.log('\nStep B2 — Sign up driver (handle_new_user trigger creates drivers row)');
  const { data: signUp, error: signUpErr } = await baseClient.auth.signUp({
    email, password,
    options: {
      data: {
        role: 'driver',
        fullName,
        vehicleNumber,
        companyId: rows[0].company_id,
        companyName: rows[0].company_name,
      },
    },
  });
  if (signUpErr || !signUp.session) {
    check('B2 signUp', false, signUpErr?.message ?? 'no session');
    return;
  }
  check('B2 signUp', true, `authUid=${signUp.user.id}`);
  const drv = authedClient(signUp.session.access_token);

  console.log('\nStep B3 — Resolve driver row');
  const { data: driverRow, error: dErr } = await drv
    .from('drivers').select('id, name, profile_picture_url, company_id')
    .eq('auth_user_id', signUp.user.id).single();
  if (dErr) {
    check('B3 fetch driver', false, dErr.message);
    return;
  }
  check('B3 fetch driver', true, `id=${driverRow.id}`);

  console.log('\nStep B4 — Upload PNG to avatars bucket at "{driverAuthUid}/driver-{ts}.png"');
  const avatarPath = `${signUp.user.id}/driver-${stamp}.png`;
  const upB = await drv.storage.from('avatars').upload(avatarPath, pngBlob(), {
    contentType: 'image/png', upsert: true,
  });
  if (upB.error) {
    check('B4 upload avatar', false, `${upB.error.statusCode ?? '??'} ${upB.error.message}`);
  } else {
    check('B4 upload avatar', true, `path=${upB.data.path}`);
  }
  const avatarUrl = upB.data ? publicUrlFor('avatars', upB.data.path) : null;

  console.log('\nStep B5 — UPDATE drivers.profile_picture_url = publicUrl (RLS: drivers_own_row_update)');
  if (avatarUrl) {
    const { error: updErr } = await drv.from('drivers')
      .update({ profile_picture_url: avatarUrl }).eq('id', driverRow.id);
    check('B5 update drivers.profile_picture_url', !updErr, updErr?.message ?? '');
  } else {
    check('B5 update drivers.profile_picture_url', false, 'no avatar URL (upload failed)');
  }

  console.log('\nStep B6 — Re-fetch driver (simulates page refresh)');
  const { data: refDriver, error: refErr } = await drv
    .from('drivers').select('profile_picture_url').eq('id', driverRow.id).single();
  if (refErr) {
    check('B6 re-fetch driver', false, refErr.message);
  } else {
    const persisted = avatarUrl && refDriver.profile_picture_url === avatarUrl;
    check('B6 profile_picture_url persisted after refresh', !!persisted,
      `expected=${avatarUrl} got=${refDriver.profile_picture_url}`);
  }

  // ── Receipt flow ──
  console.log('\nStep B7 — Upload PNG to receipts bucket at "{driverAuthUid}/receipt-{saleId}-{ts}.png"');
  const saleId = randomUUID();
  const receiptPath = `${signUp.user.id}/receipt-${saleId.slice(0,8)}-${stamp}.png`;
  const upR = await drv.storage.from('receipts').upload(receiptPath, pngBlob(), {
    contentType: 'image/png', upsert: true,
  });
  if (upR.error) {
    check('B7 upload receipt', false, `${upR.error.statusCode ?? '??'} ${upR.error.message}`);
  } else {
    check('B7 upload receipt', true, `path=${upR.data.path}`);
  }
  const receiptUrl = upR.data ? publicUrlFor('receipts', upR.data.path) : null;

  console.log('\nStep B8 — INSERT sales row with receipt_image_url = publicUrl');
  const today = new Date().toISOString().split('T')[0];
  if (receiptUrl) {
    const { error: insErr } = await drv.from('sales').insert({
      id: saleId, driver_id: driverRow.id, date: today,
      total_price: 1000, receipt_image_url: receiptUrl,
    });
    check('B8 insert sales', !insErr, insErr?.message ?? '');
  } else {
    // Still insert with null so the rest of the flow runs
    const { error: insErr } = await drv.from('sales').insert({
      id: saleId, driver_id: driverRow.id, date: today,
      total_price: 1000, receipt_image_url: null,
    });
    check('B8 insert sales (receipt=null fallback)', !insErr, insErr?.message ?? '');
  }

  console.log('\nStep B9 — Re-fetch sale (simulates page refresh)');
  const { data: refSale, error: refSaleErr } = await drv
    .from('sales').select('receipt_image_url').eq('id', saleId).single();
  if (refSaleErr) {
    check('B9 re-fetch sale', false, refSaleErr.message);
  } else {
    const persisted = receiptUrl && refSale.receipt_image_url === receiptUrl;
    check('B9 receipt_image_url persisted after refresh', !!persisted,
      `expected=${receiptUrl} got=${refSale.receipt_image_url}`);
  }
}

// ── Run ──────────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('TrackTracker — Image Upload End-to-End Verification');
console.log('Project: qexafenusvjkyzfhtpda.supabase.co');
console.log('Time:   ', new Date().toISOString());
console.log('═══════════════════════════════════════════════════════════════════════');

const a = await flowA();
await flowB(a);

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`Summary: ${pass} PASS / ${fail} FAIL`);
console.log('═══════════════════════════════════════════════════════════════════════');
if (fail > 0) {
  console.log('');
  console.log('If any storage upload (A3, B4, B7) failed with 403 RLS or 404 Bucket');
  console.log('not found, the ONLY remaining step is to run src/db/storage_setup.sql');
  console.log('in the Supabase Dashboard → SQL Editor → New query → Run. After that,');
  console.log('re-run this script and all steps should PASS.');
}
process.exit(fail > 0 ? 1 : 0);
