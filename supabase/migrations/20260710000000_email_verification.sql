-- Non-blocking email verification (users get instant access; verifying is optional).
-- email_confirmed_at from Supabase is auto-set (autoconfirm on); this is our own
-- soft "verified" flag we nudge users toward.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
-- no policies: service role only
