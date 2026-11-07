-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic Payment Completion + Subscription Activation RPC (v2 — strict design)
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
--   - SECURITY DEFINER with search_path pinned to public
--   - REVOKE from public, anon, authenticated
--   - GRANT only to the service role (backend)
--
-- Idempotent — safe to retry. Row locks prevent concurrent double-activation.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old version if exists
drop function if exists public.complete_payment_and_activate(text, text, text);

create or replace function public.complete_payment_and_activate(
  p_payment_id text,
  p_provider_transaction_id text
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_record record;
  v_company record;
  v_plan_limits int;
  v_expires_at timestamptz;
  v_now timestamptz := now();
begin
  -- ── 1. Lock the payment record ──
  select id, order_id, company_id, plan_id, amount, status, transaction_id
    into v_record
  from public.payment_records
  where id = p_payment_id
  for update;

  -- ── 2. Verify record exists ──
  if v_record is null then
    return 'payment_not_found';
  end if;

  -- ── 3. Verify status is eligible ──
  if v_record.status = 'completed' then
    return 'already_completed';
  end if;

  if v_record.status = 'duplicate_paid' then
    return 'already_duplicate_paid';
  end if;

  if v_record.status != 'pending' then
    return 'payment_not_pending';
  end if;

  -- ── 4. Verify provider transaction ID matches ──
  -- The payment record must have a transaction_id set by the create endpoint
  -- after ZainCash init succeeded. If it's NULL, the payment never reached
  -- ZainCash — do not complete it.
  if v_record.transaction_id is null then
    return 'no_transaction_id';
  end if;

  if v_record.transaction_id != p_provider_transaction_id then
    return 'transaction_id_mismatch';
  end if;

  -- ── 5. Verify company_id is a valid UUID (not a name) ──
  -- Old records may store company names as text. Do NOT cast names to UUID.
  -- Use a regex check: UUIDs match the pattern 8-4-4-4-12 hex chars.
  if v_record.company_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    -- Old name-based record — cannot resolve company UUID safely
    raise exception 'Payment record company_id is not a valid UUID (old name-based record). Manual review required. payment_id=%', p_payment_id
      using errcode = 'data_exception';
  end if;

  -- ── 6. Verify amount is positive ──
  if v_record.amount <= 0 then
    return 'invalid_amount';
  end if;

  -- ── 7. Verify plan_id is a supported plan ──
  if v_record.plan_id not in ('plan-10', 'plan-25', 'plan-50', 'plan-unlimited', 'promo-track1') then
    return 'unsupported_plan';
  end if;

  -- ── 8. Lock the company row ──
  select id, subscription_active, subscription_expires_at, subscription_plan_id
    into v_company
  from public.companies
  where id = v_record.company_id::uuid
  for update;

  if v_company is null then
    return 'company_not_found';
  end if;

  -- ── 9. Check cross-transaction: is subscription already active? ──
  if v_company.subscription_active is true
     and v_company.subscription_expires_at is not null
     and v_company.subscription_expires_at > v_now then
    -- Another payment already activated the subscription
    -- Mark this payment as duplicate_paid, do NOT extend
    update public.payment_records
      set    status = 'duplicate_paid',
             updated_at = v_now
      where  id = p_payment_id;

    return 'duplicate_paid';
  end if;

  -- ── 10. Activate the subscription ──
  -- Calendar-month expiry (matches PostgreSQL interval '1 month')
  v_expires_at := v_now + interval '1 month';

  update public.companies
    set    subscription_active     = true,
           subscription_plan_id    = v_record.plan_id,
           subscription_started_at = v_now,
           subscription_expires_at = v_expires_at,
           updated_at              = v_now
    where  id = v_company.id;

  -- ── 11. Mark payment as completed ──
  update public.payment_records
    set    status = 'completed',
           updated_at = v_now
    where  id = p_payment_id;

  return 'activated';

  -- Any exception rolls back the entire transaction automatically (PL/pgSQL default)
end;
$$;

-- ── Security: revoke from everyone, grant only to service role ──
revoke execute on function public.complete_payment_and_activate(text, text) from public;
revoke execute on function public.complete_payment_and_activate(text, text) from anon;
revoke execute on function public.complete_payment_and_activate(text, text) from authenticated;
-- Grant to the service role (used by the Vercel backend with SUPABASE_SERVICE_KEY)
grant execute on function public.complete_payment_and_activate(text, text) to service_role;
