-- The free tier becomes one song, once — not three a month.
--
-- Three a month never expired, so a casual player got 36 songs a year and
-- never had a reason to pay. In practice almost nobody reached it: of 120
-- users, exactly ONE has ever run out of credits, and 71% run no more than a
-- single analysis. So this closes a theoretical leak rather than a real one —
-- worth doing, but it is not what is holding back revenue (37% of first
-- analyses fail, and 52% of users have never seen a working result).
--
-- The reason one credit is defensible at all is that credits are only spent on
-- SUCCESS — a failed analysis never deducts one. "One free song" therefore
-- means one working result, however many attempts that takes, which matters a
-- great deal when more than a third of first attempts fail.

-- New signups get a single credit.
ALTER TABLE public.subscriptions ALTER COLUMN credits_total     SET DEFAULT 1;
ALTER TABLE public.subscriptions ALTER COLUMN credits_remaining SET DEFAULT 1;

-- The monthly refill is what made the free tier an annuity. Paid plans still
-- need it — annual subscribers in particular get their monthly credits from
-- here rather than from invoice.paid, which only fires once a year — so narrow
-- it to paid plans instead of removing it.
SELECT cron.unschedule('reset-monthly-credits')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-monthly-credits');

SELECT cron.schedule(
  'reset-monthly-credits',
  '0 3 * * *',
  $$
  UPDATE public.subscriptions
  SET credits_remaining = credits_total, credits_reset_at = now()
  WHERE credits_reset_at <= now() - interval '30 days'
    AND plan_type <> 'free'
  $$
);

-- The column defaults above are not what new users actually get: the signup
-- trigger inserts the number explicitly, so it has to change too. (Verified the
-- hard way — a test signup still came out with 3.)
--
-- The 0-credit cases are left exactly as they were, and they matter more now
-- than they did: when the free song never comes back, the incentive to sign up
-- again for another one goes up, and signup_registry + normalize_email is what
-- stops that.
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm_email text;
  email_domain text;
  already_seen boolean;
  is_disposable boolean;
  free_credits int;
BEGIN
  norm_email := public.normalize_email(NEW.email);
  email_domain := split_part(norm_email, '@', 2);

  SELECT EXISTS (
    SELECT 1 FROM public.signup_registry WHERE normalized_email = norm_email
  ) INTO already_seen;

  SELECT EXISTS (
    SELECT 1 FROM public.disposable_email_domains WHERE domain = email_domain
  ) INTO is_disposable;

  free_credits := CASE WHEN already_seen OR is_disposable THEN 0 ELSE 1 END;

  INSERT INTO public.subscriptions (user_id, plan_type, credits_remaining, credits_total)
  VALUES (NEW.id, 'free', free_credits, 1)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.signup_registry (user_id, normalized_email, granted_credits)
  VALUES (NEW.id, norm_email, free_credits > 0);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block a signup on bookkeeping problems
  RETURN NEW;
END $$;

-- Existing free users keep whatever they already have. Clawing credits back
-- from people who signed up under the old terms would cost goodwill for no
-- gain: only one of them has ever exhausted an allowance, and more than half
-- have yet to see a single successful analysis — those are exactly the people
-- who still need a second attempt. New terms apply to new signups.
