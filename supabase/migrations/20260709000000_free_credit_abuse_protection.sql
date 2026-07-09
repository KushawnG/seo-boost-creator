-- Free-credit abuse protection:
-- 1. Subscription rows become server-managed only (clients could previously
--    insert/update their own row with arbitrary credit values).
-- 2. New signups get credits from a SECURITY DEFINER trigger that normalizes
--    emails (+aliases, gmail dots) and denies free credits to repeat
--    identities and disposable email domains.
-- 3. song_analysis gains client_ip so the analyze function can cap free-plan
--    usage per network.

-- ---------- 1. Lock down subscriptions ----------
DROP POLICY IF EXISTS "Users can create their own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscription" ON public.subscriptions;
-- remaining: SELECT for owners, ALL for service role

-- ---------- 2. Email normalization + signup registry ----------
CREATE OR REPLACE FUNCTION public.normalize_email(email text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  local_part text;
  domain_part text;
BEGIN
  email := lower(trim(email));
  local_part := split_part(email, '@', 1);
  domain_part := split_part(email, '@', 2);
  -- everything after '+' is an alias on all major providers
  local_part := split_part(local_part, '+', 1);
  -- gmail ignores dots in the local part
  IF domain_part IN ('gmail.com', 'googlemail.com') THEN
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  END IF;
  RETURN local_part || '@' || domain_part;
END;
$$;

CREATE TABLE IF NOT EXISTS public.signup_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  normalized_email TEXT NOT NULL,
  granted_credits BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_registry_email_idx ON public.signup_registry (normalized_email);
ALTER TABLE public.signup_registry ENABLE ROW LEVEL SECURITY;
-- no policies: service role only

CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain TEXT PRIMARY KEY
);
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;

INSERT INTO public.disposable_email_domains (domain) VALUES
('mailinator.com'),('guerrillamail.com'),('guerrillamail.net'),('guerrillamail.org'),('guerrillamail.biz'),
('sharklasers.com'),('grr.la'),('10minutemail.com'),('10minutemail.net'),('temp-mail.org'),
('temp-mail.io'),('tempmail.com'),('tempmail.dev'),('tempmailo.com'),('tempail.com'),
('yopmail.com'),('yopmail.fr'),('yopmail.net'),('throwawaymail.com'),('getnada.com'),
('nada.email'),('inboxkitten.com'),('maildrop.cc'),('dispostable.com'),('mintemail.com'),
('trashmail.com'),('trashmail.de'),('mailnesia.com'),('mailcatch.com'),('mohmal.com'),
('emailondeck.com'),('spamgourmet.com'),('mytemp.email'),('burnermail.io'),('fakermail.com'),
('mail-temp.com'),('crazymailing.com'),('tempinbox.com'),('fakeinbox.com'),('mailsac.com'),
('33mail.com'),('spambox.us'),('mailexpire.com'),('tempr.email'),('discard.email'),
('discardmail.com'),('spam4.me'),('mailnull.com'),('incognitomail.com'),('mailimate.com'),
('anonbox.net'),('deadaddress.com'),('emailsensei.com'),('emailtemporario.com.br'),('spamavert.com'),
('mailscrap.com'),('mailzilla.com'),('mailmetrash.com'),('trashymail.com'),('tradermail.info'),
('wegwerfmail.de'),('wegwerfmail.net'),('einrot.com'),('fleckens.hu'),('armyspy.com'),
('cuvox.de'),('dayrep.com'),('gustr.com'),('jourrapide.com'),('rhyta.com'),
('superrito.com'),('teleworm.us'),('mail7.io'),('moakt.com'),('tmails.net'),
('disbox.net'),('mailpoof.com'),('luxusmail.org'),('mail.tm'),('dropmail.me'),
('minuteinbox.com'),('tempmailer.com'),('temporarymail.com'),('mail-temporaire.fr'),('spamdecoy.net'),
('mailslurp.com'),('inboxes.com'),('tempmailbox.net'),('emlpro.com'),('generator.email'),
('emailfake.com'),('tempm.com'),('cs.email'),('vomoto.com'),('zetmail.com'),
('1secmail.com'),('1secmail.org'),('1secmail.net'),('kzccv.com'),('rteet.com'),
('esiix.com'),('wwjmp.com'),('xojxe.com'),('yoggm.com'),('txcct.com')
ON CONFLICT (domain) DO NOTHING;

-- Backfill the registry with existing users so duplicates of current
-- accounts don't earn fresh credits
INSERT INTO public.signup_registry (user_id, normalized_email, granted_credits)
SELECT id, public.normalize_email(email), true
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------- 3. Server-side credit issuance on signup ----------
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
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

  free_credits := CASE WHEN already_seen OR is_disposable THEN 0 ELSE 3 END;

  INSERT INTO public.subscriptions (user_id, plan_type, credits_remaining, credits_total)
  VALUES (NEW.id, 'free', free_credits, 3)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.signup_registry (user_id, normalized_email, granted_credits)
  VALUES (NEW.id, norm_email, free_credits > 0);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block a signup on bookkeeping problems
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- ---------- 4. Per-network cap for free-plan analyses ----------
ALTER TABLE public.song_analysis ADD COLUMN IF NOT EXISTS client_ip TEXT;
CREATE INDEX IF NOT EXISTS song_analysis_client_ip_idx ON public.song_analysis (client_ip, created_at);

CREATE OR REPLACE FUNCTION public.count_recent_free_ip_analyses(p_ip text)
RETURNS integer
SECURITY DEFINER
SET search_path = ''
LANGUAGE sql STABLE
AS $$
  SELECT count(*)::int
  FROM public.song_analysis a
  JOIN public.subscriptions s ON s.user_id = a.user_id
  WHERE a.client_ip = p_ip
    AND a.status = 'completed'
    AND a.created_at > now() - interval '30 days'
    AND s.plan_type = 'free';
$$;
