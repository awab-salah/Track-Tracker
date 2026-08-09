-- ── FCM Tokens Table ──────────────────────────────────────────────────────────
-- Stores FCM Web Push registration tokens for company owners.
-- Each company can have multiple tokens (multiple devices/browsers).

CREATE TABLE IF NOT EXISTS public.fcm_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Each (company_id, token) pair must be unique
  CONSTRAINT fcm_tokens_company_token_unique UNIQUE (company_id, token)
);

-- Index for fast lookups by company_id
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_company_id ON public.fcm_tokens(company_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company owners can read own FCM tokens"
  ON public.fcm_tokens FOR SELECT
  USING (
    company_id = (
      SELECT c.id FROM public.companies c
      WHERE c.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Company owners can insert own FCM tokens"
  ON public.fcm_tokens FOR INSERT
  WITH CHECK (
    company_id = (
      SELECT c.id FROM public.companies c
      WHERE c.auth_user_id = auth.uid()
      LIMIT 1
    )
  );

CREATE POLICY "Company owners can delete own FCM tokens"
  ON public.fcm_tokens FOR DELETE
  USING (
    company_id = (
      SELECT c.id FROM public.companies c
      WHERE c.auth_user_id = auth.uid()
      LIMIT 1
    )
  );
