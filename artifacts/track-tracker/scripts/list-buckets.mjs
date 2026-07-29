// List the actual storage buckets on the live Supabase project
// so we can see exactly what exists and what's missing.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qexafenusvjkyzfhtpda.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_x7im7A-wpUvo7MX8jCRICA_IPaKydUs';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// listBuckets requires authentication — sign up a throwaway user, then list.
const stamp = Date.now().toString(36);
const email = `bucket-check+${stamp}@track-tracker.test`;
const password = 'BucketCheck123!';

const { data: signUp, error: signUpErr } = await sb.auth.signUp({
  email, password,
  options: { data: { role: 'company', companyName: `BucketCheck ${stamp}`, joinCode: `BC${stamp.slice(-3).toUpperCase()}` } },
});

if (signUpErr || !signUp?.session) {
  console.error('Could not sign up throwaway user to list buckets:', signUpErr?.message ?? 'no session');
  process.exit(1);
}

const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${signUp.session.access_token}` } },
});

const { data: buckets, error } = await authed.storage.listBuckets();

if (error) {
  console.error('listBuckets error:', error.message);
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('Storage buckets on qexafenusvjkyzfhtpda.supabase.co');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`Total buckets: ${buckets.length}`);
console.log('');
for (const b of buckets) {
  console.log(`  id=${b.id}  name=${b.name}  public=${b.public}  file_size_limit=${b.file_size_limit ?? '(default)'}`);
}
console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Expected by the frontend:');
console.log('  avatars        (public)  — used for company logos + driver photos');
console.log('  receipts       (public)  — used for sale receipt images');
console.log('═══════════════════════════════════════════════════════════════');
const hasAvatars = buckets.some(b => b.id === 'avatars');
const hasReceipts = buckets.some(b => b.id === 'receipts');
console.log(`avatars exists:        ${hasAvatars ? 'YES ✅' : 'NO ❌'}`);
console.log(`receipts exists:       ${hasReceipts ? 'YES ✅' : 'NO ❌  ← this is why B7 returned 404'}`);

// Also list orphan buckets the frontend doesn't use (e.g. 'sale-receipts'
// from an older SQL version).
const orphan = buckets.filter(b => b.id !== 'avatars' && b.id !== 'receipts');
if (orphan.length > 0) {
  console.log('');
  console.log('Orphan buckets (frontend does not use these):');
  for (const b of orphan) {
    console.log(`  ${b.id} — safe to delete via: delete from storage.buckets where id = '${b.id}';`);
  }
}

process.exit(0);
