-- New plan structure: Free 3 / Pro 15 / Premium 40 analyses per month.
-- Credits refill on a rolling 30-day cycle via pg_cron (Stripe webhooks will
-- take over the paid-plan cycle later).
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.subscriptions ALTER COLUMN credits_remaining SET DEFAULT 3;
ALTER TABLE public.subscriptions ALTER COLUMN credits_total SET DEFAULT 3;

UPDATE public.subscriptions
SET credits_total = 3, credits_remaining = LEAST(credits_remaining, 3)
WHERE plan_type = 'free';

SELECT cron.schedule(
  'reset-monthly-credits',
  '0 3 * * *',
  $$
  UPDATE public.subscriptions
  SET credits_remaining = credits_total, credits_reset_at = now()
  WHERE credits_reset_at <= now() - interval '30 days'
  $$
);
