// Sign up a company + driver via the Supabase REST API (which returns an
// access_token even when the React app's signup flow gets session=null due
// to the handle_new_user trigger). Then prints the session data so the
// browser script can inject it into localStorage and bypass the React
// signup form entirely.
//
// Usage:
//   node scripts/seed-test-users.mjs > /tmp/test-users.json
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

const baseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function authedClient(accessToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

const stamp = Date.now().toString(36);
const coEmail = `verify-co+${stamp}@track-tracker.test`;
const coPass = 'VerifyCo123!';
const coName = `Verify Co ${stamp}`;
const joinCode = `VC${stamp.slice(-4).toUpperCase()}`;

console.error(`[company] signing up ${coEmail}...`);
const { data: coSignUp, error: coErr } = await baseClient.auth.signUp({
  email: coEmail,
  password: coPass,
  options: { data: { role: 'company', companyName: coName, joinCode } },
});
if (coErr || !coSignUp.user) {
  console.error('Company signup failed:', coErr?.message ?? 'no user');
  process.exit(1);
}
const coUid = coSignUp.user.id;
const coAccessToken = coSignUp.session?.access_token;
if (!coAccessToken) {
  console.error('Company signup returned no session — cannot continue');
  process.exit(1);
}
console.error(`[company] OK uid=${coUid}`);

const co = authedClient(coAccessToken);
const { data: coRow, error: coFetchErr } = await co
  .from('companies').select('id, name, join_code, logo_url')
  .eq('auth_user_id', coUid).single();
if (coFetchErr) {
  console.error('Company row fetch failed:', coFetchErr.message);
  process.exit(1);
}
console.error(`[company] row id=${coRow.id} join_code=${coRow.join_code}`);

// ── Driver ─────────────────────────────────────────────────────────────────
const drvEmail = `verify-drv+${stamp}@track-tracker.test`;
const drvPass = 'VerifyDrv123!';
const drvName = `Verify Driver ${stamp}`;
const drvVehicle = `VRV-${stamp.slice(-4).toUpperCase()}`;

console.error(`[driver] signing up ${drvEmail}...`);
const { data: drvSignUp, error: drvErr } = await baseClient.auth.signUp({
  email: drvEmail,
  password: drvPass,
  options: {
    data: {
      role: 'driver',
      fullName: drvName,
      vehicleNumber: drvVehicle,
      companyId: coRow.id,
      companyName: coRow.name,
    },
  },
});
if (drvErr || !drvSignUp.user) {
  console.error('Driver signup failed:', drvErr?.message ?? 'no user');
  process.exit(1);
}
const drvUid = drvSignUp.user.id;
const drvAccessToken = drvSignUp.session?.access_token;
if (!drvAccessToken) {
  console.error('Driver signup returned no session — cannot continue');
  process.exit(1);
}
console.error(`[driver] OK uid=${drvUid}`);

const drv = authedClient(drvAccessToken);
const { data: drvRow, error: drvFetchErr } = await drv
  .from('drivers').select('id, name, profile_picture_url, company_id')
  .eq('auth_user_id', drvUid).single();
if (drvFetchErr) {
  console.error('Driver row fetch failed:', drvFetchErr.message);
  process.exit(1);
}
console.error(`[driver] row id=${drvRow.id}`);

// ── Output the session data so the browser script can inject it ────────────
const output = {
  stamp,
  company: {
    email: coEmail,
    password: coPass,
    name: coName,
    uid: coUid,
    id: coRow.id,
    joinCode: coRow.join_code,
    accessToken: coAccessToken,
  },
  driver: {
    email: drvEmail,
    password: drvPass,
    name: drvName,
    vehicle: drvVehicle,
    uid: drvUid,
    id: drvRow.id,
    companyId: coRow.id,
    accessToken: drvAccessToken,
  },
};
console.log(JSON.stringify(output, null, 2));
