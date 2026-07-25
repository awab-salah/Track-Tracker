-- Track-Tracker — Subscription Migration
-- Run this SQL in the Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/qexafenusvjkyzfhtpda/sql)
--
-- This adds:
--   1. The subscription_active column on the companies table
--   2. The activate_subscription RPC function for code-based activation
--
-- IMPORTANT: Run ALL of this in ONE batch in the SQL Editor.
-- It is idempotent — safe to re-run.

-- ── 1. Add subscription_active column ──

alter table companies
  add column if not exists subscription_active boolean not null default false;

-- ── 2. Activate_subscription RPC ──
-- Called by authenticated company owners to activate their subscription.
-- Valid activation code: 'track1'. Stripe will replace this later.

create or replace function public.activate_subscription(p_activation_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if lower(trim(p_activation_code)) <> 'track1' then
    return false;
  end if;

  select id into v_company_id
  from   public.companies
  where  auth_user_id = auth.uid();

  if v_company_id is null then
    return false;
  end if;

  update public.companies
  set    subscription_active = true,
         updated_at          = now()
  where  id = v_company_id;

  return true;
end;
$$;

grant execute on function public.activate_subscription(text) to authenticated;
