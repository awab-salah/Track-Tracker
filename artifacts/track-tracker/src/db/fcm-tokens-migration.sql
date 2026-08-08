-- ── FCM tokens table ──────────────────────────────────────────────────────────
--
-- Stores browser FCM registration tokens so the Supabase Edge Function
-- (notify-sale) can look them up and send push messages.
--
-- One row per (company_id, token) — a company owner on two browsers gets
-- two rows with different tokens.

create table if not exists fcm_tokens (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies(id) on delete cascade,
  token      text        not null,
  created_at timestamptz not null default now(),

  unique (company_id, token)
);

create index if not exists fcm_tokens_company_idx on fcm_tokens(company_id);

alter table fcm_tokens enable row level security;

-- Company owner can read and insert their own tokens.
create policy fcm_tokens_company_own on fcm_tokens
  for all
  using (
    exists (
      select 1 from companies
       where companies.id = fcm_tokens.company_id
         and companies.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from companies
       where companies.id = fcm_tokens.company_id
         and companies.auth_user_id = auth.uid()
    )
  );

-- Service role (used by the Edge Function) bypasses RLS, so no additional
-- policy is needed for the notify-sale function.
