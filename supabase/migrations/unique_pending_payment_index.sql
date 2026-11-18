-- ─────────────────────────────────────────────────────────────────────────────
-- Unique Partial Index: One pending payment per company
--
-- Ensures only ONE payment_records row with status='pending' can exist
-- per company at any time. This provides database-level atomic concurrency
-- protection — two simultaneous payment requests cannot both create pending
-- records for the same company.
--
-- The INSERT will fail with a unique constraint violation if a second
-- pending record is attempted while another is still active.
--
-- Idempotent — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists payment_records_one_pending_per_company
  on public.payment_records(company_id)
  where status = 'pending';
