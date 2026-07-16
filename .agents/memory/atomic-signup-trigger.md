---
name: Atomic Signup via DB Trigger
description: Why company/driver rows are created by a DB trigger, not by client-side code, and what metadata must be present in signUp options.data.
---

## Rule
Never insert into `companies` or `drivers` from client-side auth code after `supabase.auth.signUp()`. The `handle_new_user` trigger on `auth.users` does this atomically inside the same transaction.

**Why:** Client-side insert-after-signup has two failure modes:
1. If the DB insert fails, `signOut()` is called but cannot delete the auth user (needs admin API) → orphaned auth account blocks future signup with same email.
2. If Supabase email confirmation is enabled, `signUp()` returns a null session → the subsequent RLS-protected INSERT fails because `auth.uid()` is null.

The trigger fires on INSERT regardless of confirmation state and rolls back the auth user creation if it raises an exception.

## How to apply
- `companySignUp`: pass `{ role, companyName, joinCode }` in `options.data`. No extra DB calls needed.
- `driverSignUp`: validate join code first via `validate_join_code()` RPC, then pass `{ role, fullName, vehicleNumber, companyId, companyName }` in `options.data`. No extra DB calls needed.
- If `signUp()` returns `data.session === null`, it means email confirmation is required — surface `emailConfirmationRequired: true` to the caller; do NOT attempt any DB writes.
- The trigger function is `public.handle_new_user()` in `schema.sql` (section 6b).

## Email confirmation UX
Both `CompanyAuth.tsx` and `DriverAuth.tsx` have a `registrationPending` state. When `emailConfirmationRequired` is true from the auth service, set this state to show an Arabic "check your email" banner instead of navigating to the dashboard.

## validate_join_code RPC
- Replaces the old `companies_select_any` RLS policy (which exposed full table to anon).
- Function: `public.validate_join_code(p_join_code text) RETURNS TABLE(company_id uuid, company_name text)` — SECURITY DEFINER, granted to `anon` and `authenticated`.
- Client call: `supabase.rpc('validate_join_code', { p_join_code: joinCode })`.
- Used in `companyRepository.fetchCompanyByJoinCode()`.
