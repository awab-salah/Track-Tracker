-- ─────────────────────────────────────────────────────────────────────────────
-- Restrict execution privileges on payment-record helper RPCs + install the
-- status-guard trigger + RLS safety net for payment_completer.
--
-- SECURITY MODEL (no custom GUC — the prior app.complete_payment_rpc design was
-- bypassable because ANY role can SET/set_config a custom GUC):
--
--   A NOLOGIN role `payment_completer` owns complete_payment_and_activate
--   (SECURITY DEFINER). Inside that function current_user = 'payment_completer'.
--   The payment_records_status_guard trigger permits a transition to
--   status='completed' ONLY when current_user = 'payment_completer'.
--
--   Why this is NOT bypassable by untrusted callers:
--     * current_user is NOT a caller-settable setting (unlike a custom GUC).
--     * current_user becomes 'payment_completer' ONLY by executing inside a
--       SECURITY DEFINER function owned by payment_completer. The only such
--       function is complete_payment_and_activate.
--     * payment_completer is NOLOGIN and has NO memberships (granted to no one),
--       so anon/authenticated/service_role cannot `SET ROLE payment_completer`.
--       (Only a superuser could; superusers are trusted infra, not API callers.)
--     * update_payment_record + direct UPDATEs run as their own owner
--       (postgres/service_role) — never payment_completer — so the trigger
--       rejects their status='completed' UPDATE.
--     * The trigger is SECURITY INVOKER so it INHERITS the calling function's
--       elevated current_user (a SECURITY DEFINER trigger would see its own
--       owner instead — fixed).
--
-- RLS: payment_completer is NOT granted BYPASSRLS. Instead, permissive RLS
-- policies grant payment_completer the row access the RPC needs. These are
-- DORMANT if RLS is disabled on the table and ACTIVE if RLS is enabled (Supabase
-- default). They do NOT force-enable RLS, do NOT alter existing policies, and do
-- NOT weaken anon/authenticated access. This is the narrowest design that works
-- under the unknown live RLS configuration.
--
-- This migration:
--   1. Creates payment_completer (NOLOGIN, no memberships) + DML grants.
--   2. REVOKEs EXECUTE on get_payment_record + update_payment_record (every
--      overload, signatures resolved dynamically) from PUBLIC/anon/authenticated;
--      GRANTs to service_role. Fails clearly if neither function exists.
--   3. Reassigns complete_payment_and_activate ownership to payment_completer +
--      ensures SECURITY DEFINER.
--   4. Installs payment_records_status_guard (idempotent).
--   5. Adds permissive RLS policies for payment_completer (idempotent).
--
-- Idempotent. NOT applied to the live DB by the agent. Apply with service_role
-- AFTER atomic_complete_payment_and_activate.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. payment_completer role ────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'payment_completer') then
    create role payment_completer nologin;
  end if;
end
$$;
-- No memberships: do NOT grant payment_completer to any role.
-- Least-privilege: USAGE only on schema public. CREATE is NOT needed at
-- runtime (the RPC never creates objects — it only SELECTs/UPDATEs rows,
-- which USAGE + table grants cover). CREATE is granted transiently in step 3
-- solely to satisfy PostgreSQL's schema-privilege requirement for ALTER
-- FUNCTION OWNER TO, then revoked immediately after the transfer.
grant usage on schema public                       to payment_completer;
grant select, update on table public.payment_records to payment_completer;
grant select, update on table public.companies      to payment_completer;

-- ── 2. Harden get_payment_record + update_payment_record (every overload) ────
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select proname, oid
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('get_payment_record', 'update_payment_record')
    order by proname, oid
  loop
    execute format(
      'revoke execute on function public.%s(%s) from public, anon, authenticated',
      r.proname, pg_get_function_identity_arguments(r.oid)
    );
    execute format(
      'grant execute on function public.%s(%s) to service_role',
      r.proname, pg_get_function_identity_arguments(r.oid)
    );
    n := n + 1;
  end loop;
  if n = 0 then
    raise exception 'Expected functions get_payment_record and/or update_payment_record not found in public schema — cannot harden privileges. Apply the V2 schema migrations that define them first.';
  end if;
end
$$;

-- ── 3. Reassign the atomic RPC to payment_completer (SECURITY DEFINER) ───────
-- Supabase's migration runner (postgres) has rolcreaterole but rolsuper=FALSE,
-- so ALTER FUNCTION ... OWNER TO <role> requires the runner to be a MEMBER of
-- the target role (PostgreSQL checks has_privs_of_role before the transfer).
-- payment_completer was created above by the runner, which has ADMIN OPTION on
-- roles it creates, so the runner grants payment_completer to itself here.
--
-- This membership is HARMLESS to the security model: postgres is trusted infra
-- (DB owner / migration runner, NOT API-callable). anon/authenticated/service_role
-- are NOT members of payment_completer (membership is not transitive), so they
-- still CANNOT SET ROLE payment_completer. The grant is idempotent on re-runs.
do $$
begin
  execute format('grant payment_completer to %I', current_user);
end
$$;
-- Temporarily grant CREATE on schema public so the new owner satisfies
-- PostgreSQL's schema-privilege requirement for ALTER FUNCTION OWNER TO
-- (the new owner of a SECURITY DEFINER function must hold CREATE on its
-- schema). Revoked immediately after the transfer so the FINAL state is
-- least-privilege: payment_completer holds only USAGE on public. Idempotent
-- on re-runs (grant is a no-op if already present; revoke is a no-op if absent).
grant create on schema public to payment_completer;
alter function public.complete_payment_and_activate(text, text) owner to payment_completer;
alter function public.complete_payment_and_activate(text, text) security definer;
revoke execute on function public.complete_payment_and_activate(text, text) from public, anon, authenticated;
grant  execute on function public.complete_payment_and_activate(text, text) to service_role;
revoke create on schema public from payment_completer;

-- ── 3b. Guarantee activate_subscription (track1 promo) owner is in the guard allowlist ──
-- activate_subscription (defined by subscription_expiry_and_driver_limits.sql, already
-- applied live) is SECURITY DEFINER; inside it current_user = its owner. The
-- companies_subscription_activation_guard allows {payment_completer, postgres,
-- supabase_admin}. Reassign owner to postgres (the standard migration-runner role,
-- always in the allowlist) so the legitimate track1 promo path is GUARANTEED to
-- work regardless of the live owner. Skipped if activate_subscription doesn't
-- exist (e.g., the PGlite test harness, which doesn't apply subscription_expiry).
-- Idempotent + safe: postgres is a trusted superuser; SECURITY DEFINER already
-- runs as the owner, so this does not change activate_subscription's behavior.
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'activate_subscription'
      and pg_get_function_identity_arguments(oid) = 'text'
  ) then
    execute 'alter function public.activate_subscription(text) owner to postgres';
  end if;
end
$$;

-- ── 4. Status-guard trigger (SECURITY INVOKER — inherits caller's current_user)
drop trigger if exists payment_records_status_guard on public.payment_records;

create or replace function public.payment_records_status_guard_fn()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user text := current_user;
begin
  if tg_op = 'UPDATE'
     and new.status = 'completed'
     and old.status is distinct from 'completed'
     and v_user <> 'payment_completer' then
    raise exception
      'payment_records.status cannot be set to ''completed'' outside complete_payment_and_activate (rejected by payment_records_status_guard: current_user=%)',
      v_user;
  end if;
  return new;
end;
$$;

create trigger payment_records_status_guard
  before update of status on public.payment_records
  for each row
  execute function public.payment_records_status_guard_fn();

revoke execute on function public.payment_records_status_guard_fn() from public, anon, authenticated;

-- ── 4b. Companies subscription-activation guard ────────────────────────────
-- Blocks ANY UPDATE that transitions companies.subscription_active to true
-- unless current_user is an AUTHORIZED activator:
--   * 'payment_completer'  — the V2 atomic complete_payment_and_activate RPC.
--   * 'postgres' / 'supabase_admin' — trusted infra superuser roles that own
--     the existing SECURITY DEFINER `activate_subscription` RPC (the track1
--     promo flow, schema.sql:277) and run migrations. These are NOT
--     API-callable, so allowing them does not weaken the guard against
--     anon/authenticated/service_role direct PATCHes.
-- This PRESERVES the legitimate track1 promo activation (a non-payment
-- free-trial path) while closing the unauthorized direct-PATCH bypass in the
-- V1 route (zaincash.ts service_role) + the anon frontend fallback
-- (AppContext.tsx:549). service_role is intentionally NOT in the allowlist —
-- V1 payment completion is deprecated (the frontend uses V2 via
-- subscribeToPlan; the payment_records guard already blocks V1's
-- update_payment_record('completed')). Deactivation (true→false, incl.
-- deactivate_expired_subscriptions) is never blocked. SECURITY INVOKER so it
-- inherits the calling function's current_user.
drop trigger if exists companies_subscription_activation_guard on public.companies;

create or replace function public.companies_subscription_activation_guard_fn()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user text := current_user;
begin
  if tg_op = 'UPDATE'
     and new.subscription_active = true
     and old.subscription_active is distinct from true
     and v_user not in ('payment_completer', 'postgres', 'supabase_admin') then
    raise exception
      'companies.subscription_active cannot be set to true outside complete_payment_and_activate or activate_subscription (rejected by companies_subscription_activation_guard: current_user=%)',
      v_user;
  end if;
  return new;
end;
$$;

create trigger companies_subscription_activation_guard
  before update of subscription_active on public.companies
  for each row
  execute function public.companies_subscription_activation_guard_fn();

revoke execute on function public.companies_subscription_activation_guard_fn() from public, anon, authenticated;

-- ── 5. RLS safety net for payment_completer (narrowest design, no BYPASSRLS) ─
-- payment_completer runs ONLY inside the SECURITY DEFINER atomic RPC, which
-- validates arguments before touching any row. These PERMISSIVE policies grant
-- payment_completer the row access the RPC needs. Dormant if RLS is off; active
-- if RLS is on. They do NOT force-enable RLS, alter existing policies, or grant
-- BYPASSRLS — so anon/authenticated access is unaffected.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_records' and policyname='payment_completer_all') then
    create policy payment_completer_all on public.payment_records
      for all to payment_completer using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='companies' and policyname='payment_completer_all') then
    create policy payment_completer_all on public.companies
      for all to payment_completer using (true) with check (true);
  end if;
end
$$;
