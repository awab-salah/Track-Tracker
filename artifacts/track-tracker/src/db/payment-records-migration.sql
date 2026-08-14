-- ─────────────────────────────────────────────────────────────────────────────
-- TrackTracker – payment_records table migration
--
-- This table is REQUIRED by the ZainCash payment integration.
-- Without it, the /api/zaincash/create and /api/zaincash/callback
-- endpoints cannot store or look up payment records, and subscription
-- activation will fail silently.
--
-- Run this in the Supabase SQL Editor:
--   https://supabase.com/dashboard/project/qexafenusvjkyzfhtpda/sql
--
-- This migration is idempotent (IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- Create the payment_records table
create table if not exists public.payment_records (
  id           text primary key,             -- ZainCash transaction ID
  order_id     text not null,                -- Internal order ID (format: tt-{planId}-{companyId}-{ts}-{rand})
  company_id   text not null,                -- Company identifier (company name or UUID)
  plan_id      text not null,                -- Subscription plan ID
  amount       integer not null,             -- Amount in IQD
  status       text not null default 'pending', -- pending | completed | failed | reversed
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

-- Create index for faster lookups by company_id and status
create index if not exists payment_records_company_id_idx
  on public.payment_records(company_id);

create index if not exists payment_records_status_idx
  on public.payment_records(status);

-- Enable RLS
alter table public.payment_records enable row level security;

-- RLS: Allow service role full access (for API routes using service key)
-- This is handled by Supabase automatically for service_role key.

-- RLS: Company owners can see their own payment records
-- Note: company_id stores the company NAME, not UUID. We match by name.
create policy payment_records_company_owner_select on public.payment_records
  for select
  using (
    exists (
      select 1 from companies c
       where c.name = payment_records.company_id
         and c.auth_user_id = auth.uid()
    )
  );

-- RLS: Allow authenticated inserts (the API route uses service key which bypasses RLS,
-- but this policy allows direct client inserts if needed in the future)
create policy payment_records_authenticated_insert on public.payment_records
  for insert
  with check (
    exists (
      select 1 from companies c
       where c.name = payment_records.company_id
         and c.auth_user_id = auth.uid()
    )
  );

-- Grant access
grant select on public.payment_records to authenticated;
grant insert on public.payment_records to authenticated;
