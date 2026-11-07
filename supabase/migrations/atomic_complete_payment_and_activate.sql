-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic Payment Completion + Subscription Activation RPC
--
-- Replaces the non-atomic two-step process (updatePaymentRecordStatus + 
-- activateCompanySubscription) with a single transaction that:
-- 1. Updates payment_records.status to 'completed' (only if currently 'pending')
-- 2. Checks cross-transaction (is subscription already active?)
-- 3. If already active → marks payment as 'duplicate_paid', does NOT extend
-- 4. If not active → activates subscription with 1-month expiry
-- 5. Returns a result code indicating what happened
--
-- This is idempotent: if called again with the same payment_id after
-- completion, it returns 'already_completed' without side effects.
--
-- SECURITY DEFINER: runs with elevated privileges to bypass RLS.
-- search_path pinned to public to prevent injection.
--
-- Idempotent — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.complete_payment_and_activate(
  p_payment_id text,
  p_company_id text,
  p_plan_id text default null
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_old_status text;
  v_current_active boolean;
  v_current_expires timestamptz;
  v_now timestamptz := now();
  v_expires_at timestamptz := now() + interval '1 month';
begin
  -- Step 1: Atomically update payment_records status from 'pending' to 'completed'
  -- Returns the old status (NULL if row doesn't exist)
  update public.payment_records
    set    status = 'completed',
           updated_at = v_now
    where  id = p_payment_id
      and  status = 'pending'
    returning status into v_old_status;

  -- If no row was updated, check if it's already completed (idempotent)
  if v_old_status is null then
    select status into v_old_status
    from public.payment_records
    where id = p_payment_id;

    if v_old_status = 'completed' then
      return 'already_completed';
    end if;

    if v_old_status = 'duplicate_paid' then
      return 'already_duplicate_paid';
    end if;

    -- Row doesn't exist or has unexpected status
    return 'payment_not_found';
  end if;

  -- Step 2: Check if the company already has an active subscription
  -- (cross-transaction prevention)
  select subscription_active, subscription_expires_at
    into v_current_active, v_current_expires
  from public.companies
  where id = p_company_id::uuid;

  if v_current_active is true and v_current_expires is not null and v_current_expires > v_now then
    -- Company already has active subscription — mark as duplicate_paid
    update public.payment_records
      set    status = 'duplicate_paid',
             updated_at = v_now
      where  id = p_payment_id;

    return 'duplicate_paid';
  end if;

  -- Step 3: Activate the subscription (within the same transaction)
  update public.companies
    set    subscription_active     = true,
           subscription_plan_id    = coalesce(p_plan_id, subscription_plan_id),
           subscription_started_at = v_now,
           subscription_expires_at = v_expires_at,
           updated_at              = v_now
    where  id = p_company_id::uuid;

  return 'activated';
end;
$$;

grant execute on function public.complete_payment_and_activate(text, text, text) to authenticated;
