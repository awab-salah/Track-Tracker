-- ─────────────────────────────────────────────────────────────────────────────
-- Add transaction_id column to payment_records
--
-- Stores the ZainCash transaction ID separately from the payment_records.id
-- (which is now the orderId from the atomic reservation). This allows:
-- - Stale reservation recovery (inquiry by transaction_id)
-- - Callback lookup by transaction_id when needed
--
-- Idempotent — safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.payment_records
  add column if not exists transaction_id text;

-- Index for fast lookup by transaction_id
create index if not exists payment_records_transaction_id_idx
  on public.payment_records(transaction_id)
  where transaction_id is not null;
