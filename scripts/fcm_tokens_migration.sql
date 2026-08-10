-- ============================================================================
-- fcm_tokens table: stores FCM push registration tokens per company.
--
-- Each company can have multiple tokens (one per browser/device).
-- When a driver records a sale, the server queries this table to find
-- the company owner's push tokens and sends an FCM data-only message
-- to each token. The browser's service worker receives the push and
-- shows a notification (even when the PWA is completely closed).
-- ============================================================================

-- Create the table
CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one (company_id, token) pair — prevents duplicates
-- when the same browser registers the same token twice.
CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_company_token_uniq
  ON public.fcm_tokens (company_id, token);

-- Row-Level Security: a company can only read/write its own tokens.
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: companies can manage their own tokens
CREATE POLICY "Companies can manage their own FCM tokens"
  ON public.fcm_tokens
  FOR ALL
  USING (company_id = auth.uid())
  WITH CHECK (company_id = auth.uid());

-- Index for fast lookup by company_id (used by the notify-sale function)
CREATE INDEX IF NOT EXISTS fcm_tokens_company_id_idx
  ON public.fcm_tokens (company_id);
