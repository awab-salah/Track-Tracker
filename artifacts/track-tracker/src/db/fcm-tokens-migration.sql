-- ─────────────────────────────────────────────────────────────────────────────
-- FCM Tokens table — stores Firebase Cloud Messaging device tokens per company.
-- Used by the notify-sale Edge Function to send push notifications to company
-- owners when a driver records a new sale (even when the owner's browser tab
-- is closed).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  token text not null,
  created_at timestamptz not null default now(),
  unique(company_id, token)
);

-- Enable Row Level Security so only authorized users can read/write tokens.
alter table fcm_tokens enable row level security;

-- Company owners can manage their own FCM tokens.
-- A company owner is authenticated and their auth.uid() matches
-- the company's auth_user_id column.
create policy fcm_tokens_company_own on fcm_tokens
  for all using (
    company_id in (select id from companies where auth_user_id = auth.uid())
  );
