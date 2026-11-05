-- ─────────────────────────────────────────────────────────────────────────────
-- Subscription Expiry + Driver Limit Enforcement Migration
--
-- Adds subscription duration (1-month expiry), plan tracking, and driver
-- limit enforcement at the database level (cannot be bypassed by direct
-- API requests).
--
-- Idempotent — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add subscription columns to companies ─────────────────────────────────

alter table public.companies
  add column if not exists subscription_plan_id text;

alter table public.companies
  add column if not exists subscription_started_at timestamptz;

alter table public.companies
  add column if not exists subscription_expires_at timestamptz;

-- Index for fast expiry checks
create index if not exists companies_subscription_expires_at_idx
  on public.companies(subscription_expires_at);

-- ── 1b. Set expiry for existing active subscriptions with NULL expiry ────────
--
-- Any company that already has subscription_active=true but no
-- subscription_expires_at gets a 1-month expiry from now. This ensures
-- NO subscription remains permanently active due to a missing expiry date.

update public.companies
  set    subscription_expires_at = now() + interval '1 month',
         subscription_started_at = coalesce(subscription_started_at, now() - interval '1 month'),
         updated_at = now()
  where  subscription_active = true
    and  subscription_expires_at is null;

-- ── 2. Update activate_subscription RPC to set 1-month expiry ────────────────
--
-- The promo code "track1" now grants exactly 1 month of access.
-- If the company already has a subscription_started_at (already used the
-- promo code before), reject — "track1" is first-month only.

create or replace function public.activate_subscription(p_activation_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_company_id uuid;
  v_existing_started timestamptz;
begin
  -- Validate the activation code
  if lower(trim(p_activation_code)) <> 'track1' then
    return false;
  end if;

  -- Find the company owned by the calling user
  select id into v_company_id
  from   public.companies
  where  auth_user_id = auth.uid();

  if v_company_id is null then
    return false;
  end if;

  -- Check if already has a subscription_started_at (first-month-only rule)
  select subscription_started_at into v_existing_started
  from   public.companies
  where  id = v_company_id;

  if v_existing_started is not null then
    -- This company has already used the promo code — reject
    return false;
  end if;

  -- Activate the subscription with 1-month expiry
  update public.companies
  set    subscription_active     = true,
         subscription_plan_id    = 'promo-track1',
         subscription_started_at = now(),
         subscription_expires_at = now() + interval '1 month',
         updated_at              = now()
  where  id = v_company_id;

  return true;
end;
$$;

grant execute on function public.activate_subscription(text) to authenticated;

-- ── 3. Driver limit enforcement trigger ──────────────────────────────────────
--
-- Enforces the maximum number of drivers per subscription plan.
-- Runs BEFORE INSERT on the drivers table — cannot be bypassed by direct
-- API requests or frontend Supabase calls.
--
-- Plan limits:
--   plan-10        → 10 drivers max
--   plan-25        → 25 drivers max
--   plan-50        → 50 drivers max
--   plan-unlimited → unlimited (NULL limit)
--   NULL/unknown   → 0 drivers (no plan = no drivers allowed)

create or replace function public.check_driver_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan_id       text;
  v_max_drivers   int;
  v_current_count int;
begin
  -- Get the company's subscription plan
  select subscription_plan_id into v_plan_id
  from   public.companies
  where  id = NEW.company_id;

  -- Map plan_id to max drivers
  v_max_drivers := case v_plan_id
    when 'plan-10'        then 10
    when 'plan-25'        then 25
    when 'plan-50'        then 50
    when 'plan-unlimited' then null  -- unlimited
    when 'promo-track1'   then 10    -- promo code grants plan-10 equivalent
    else 0  -- no plan or unknown plan = no drivers allowed
  end;

  -- Unlimited plan — allow any number
  if v_max_drivers is null then
    return NEW;
  end if;

  -- Count current non-deleted drivers for this company
  select count(*) into v_current_count
  from   public.drivers
  where  company_id = NEW.company_id
    and  deleted_at is null;

  -- Check if adding one more would exceed the limit
  if v_current_count >= v_max_drivers then
    raise exception 'Driver limit reached: plan % allows % drivers (currently % active)',
      v_plan_id, v_max_drivers, v_current_count
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

-- Drop old trigger if exists, then create
drop trigger if exists drivers_check_limit_trigger on public.drivers;
create trigger drivers_check_limit_trigger
  before insert on public.drivers
  for each row
  execute function public.check_driver_limit();

-- ── 4. Subscription expiry check function ────────────────────────────────────
--
-- Returns true if the company's subscription is currently active AND not expired.
-- Can be used by RLS policies or application code to check real-time status.

create or replace function public.is_subscription_active(p_company_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
    (select subscription_active
       and (subscription_expires_at is null or subscription_expires_at > now())
     from public.companies
     where id = p_company_id),
    false
  );
$$;

grant execute on function public.is_subscription_active(uuid) to authenticated;

-- ── 5. Auto-deactivate expired subscriptions (scheduled job or manual) ───────
--
-- This function can be called periodically (e.g., via a Supabase Edge Function
-- cron or Vercel scheduled function) to deactivate expired subscriptions.
-- It sets subscription_active = false for all companies whose
-- subscription_expires_at < now().

create or replace function public.deactivate_expired_subscriptions()
returns int
language sql
security definer set search_path = public
as $$
  with expired as (
    update public.companies
    set    subscription_active = false,
           updated_at = now()
    where  subscription_active = true
      and  subscription_expires_at is not null
      and  subscription_expires_at < now()
    returning 1
  )
  select count(*) from expired;
$$;

grant execute on function public.deactivate_expired_subscriptions() to authenticated;
