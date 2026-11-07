-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic Payment Completion + Subscription Activation RPC (v3 — security-hardened)
--
-- This RPC is the ONLY operation allowed to mark a verified payment as
-- completed and activate its subscription. It performs ALL operations in
-- a single PostgreSQL transaction with row-level locks.
--
-- Inputs: payment record ID + verified provider transaction ID ONLY.
-- Company UUID, plan ID, amount, and currency are read from the payment
-- record itself — never trusted from the caller.
--
-- Security:
--   - SECURITY DEFINER with search_path set to empty string
--   - Every table/function reference is schema-qualified (public.*)
--   - REVOKE from public, anon, authenticated
--   - GRANT only to service_role (backend)
--
-- Idempotent — safe to retry. Row locks prevent concurrent double-activation.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old versions if exists
drop function if exists public.complete_payment_and_activate(text, text, text);
drop function if exists public.complete_payment_and_activate(text, text);

create or replace function public.complete_payment_and_activate(
  p_payment_id text,
  p_provider_transaction_id text
)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  v_record_id text;
  v_record_order_id text;
  v_record_company_id text;
  v_record_plan_id text;
  v_record_amount integer;
  v_record_status text;
  v_record_transaction_id text;
  v_company_id uuid;
  v_company_subscription_active boolean;
  v_company_subscription_expires_at timestamptz;
  v_company_subscription_plan_id text;
  v_expires_at timestamptz;
  v_now timestamptz := now();
begin
  -- ── 1. Lock the payment record (SELECT ... FOR UPDATE) ──
  -- Schema-qualified: public.payment_records
  select id, order_id, company_id, plan_id, amount, status, transaction_id
    into v_record_id, v_record_order_id, v_record_company_id, v_record_plan_id,
         v_record_amount, v_record_status, v_record_transaction_id
  from public.payment_records
  where id = p_payment_id
  for update;

  -- ── 2. Verify record exists ──
  if v_record_id is null then
    return 'payment_not_found';
  end if;

  -- ── 3. Verify status is eligible ──
  if v_record_status = 'completed' then
    return 'already_completed';
  end if;

  if v_record_status = 'duplicate_paid' then
    return 'already_duplicate_paid';
  end if;

  if v_record_status != 'pending' then
    return 'payment_not_pending';
  end if;

  -- ── 4. Verify provider transaction ID matches the record's transaction_id ──
  -- The payment record's transaction_id is set by the V2 create endpoint
  -- after ZainCash init succeeded. If NULL, the payment never reached
  -- ZainCash — cannot complete it.
  if v_record_transaction_id is null then
    return 'no_transaction_id';
  end if;

  if v_record_transaction_id != p_provider_transaction_id then
    return 'transaction_id_mismatch';
  end if;

  -- ── 5. Verify company_id is NOT NULL and is a valid UUID ──
  -- Explicitly reject NULL company_id before any further processing.
  if v_record_company_id is null then
    return 'invalid_company_id';
  end if;

  -- Old records may store company names as text. Do NOT cast names to UUID.
  -- Regex: 8-4-4-4-12 hexadecimal characters.
  if v_record_company_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    -- Old name-based record — cannot resolve company UUID safely
    -- Raise exception to force rollback (non-retryable, requires manual review)
    raise exception 'Payment record company_id is not a valid UUID (old name-based record). Manual review required. payment_id=%', p_payment_id
      using errcode = 'data_exception';
  end if;

  -- ── 6. Verify amount is NOT NULL and positive ──
  -- Explicitly reject NULL amount before comparison (NULL <= 0 yields NULL, not false).
  if v_record_amount is null then
    return 'invalid_amount';
  end if;

  if v_record_amount <= 0 then
    return 'invalid_amount';
  end if;

  -- ── 7. Verify plan_id is NOT NULL and belongs to the approved list ──
  -- Explicitly reject NULL plan_id before the IN check (NULL NOT IN (...) yields NULL, not true).
  if v_record_plan_id is null then
    return 'unsupported_plan';
  end if;

  if v_record_plan_id not in ('plan-10', 'plan-25', 'plan-50', 'plan-unlimited', 'promo-track1') then
    return 'unsupported_plan';
  end if;

  -- ── 8. Lock the company row (SELECT ... FOR UPDATE) ──
  -- Schema-qualified: public.companies
  select id, subscription_active, subscription_expires_at, subscription_plan_id
    into v_company_id, v_company_subscription_active,
         v_company_subscription_expires_at, v_company_subscription_plan_id
  from public.companies
  where id = v_record_company_id::uuid
  for update;

  if v_company_id is null then
    return 'company_not_found';
  end if;

  -- ── 9. Cross-transaction check: is subscription already active? ──
  -- Fail-closed: NULL expiry = NOT active (can activate)
  if v_company_subscription_active is true
     and v_company_subscription_expires_at is not null
     and v_company_subscription_expires_at > v_now then
    -- Another payment already activated the subscription
    -- Mark this payment as duplicate_paid, do NOT extend
    update public.payment_records
      set    status = 'duplicate_paid',
             updated_at = v_now
      where  id = p_payment_id;

    return 'duplicate_paid';
  end if;

  -- ── 10. Activate the subscription ──
  -- Calendar-month expiry using PostgreSQL native interval '1 month'.
  -- This handles month-end correctly:
  --   Jan 31 + 1 month = Feb 28/29 (clamped by PostgreSQL)
  --   Mar 31 + 1 month = Apr 30 (clamped by PostgreSQL)
  -- Plan ID is read from the verified payment record (not caller-supplied).
  v_expires_at := v_now + interval '1 month';

  update public.companies
    set    subscription_active     = true,
           subscription_plan_id    = v_record_plan_id,
           subscription_started_at = v_now,
           subscription_expires_at = v_expires_at,
           updated_at              = v_now
    where  id = v_company_id;

  -- ── 11. Mark payment as completed ──
  update public.payment_records
    set    status = 'completed',
           updated_at = v_now
    where  id = p_payment_id;

  return 'activated';

  -- Any exception rolls back the entire transaction automatically (PL/pgSQL default)
end;
$$;

-- ── Security: revoke from ALL roles, grant ONLY to service_role ──
revoke execute on function public.complete_payment_and_activate(text, text) from public;
revoke execute on function public.complete_payment_and_activate(text, text) from anon;
revoke execute on function public.complete_payment_and_activate(text, text) from authenticated;
-- Grant ONLY to the service role (used by the Vercel backend with SUPABASE_SERVICE_KEY)
grant execute on function public.complete_payment_and_activate(text, text) to service_role;
