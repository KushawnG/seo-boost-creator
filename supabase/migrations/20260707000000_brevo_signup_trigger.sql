-- Add every new signup to the Brevo mailing list via the brevo-subscribe
-- edge function. The shared secret lives in Vault (name: brevo_webhook_secret),
-- inserted directly on the project — never committed here.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_brevo_subscribe()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'brevo_webhook_secret'
  LIMIT 1;

  IF secret IS NULL THEN
    RETURN NEW; -- newsletter sync not configured; skip
  END IF;

  PERFORM net.http_post(
    url := 'https://wthnnwnggvvktrnglxqj.supabase.co/functions/v1/brevo-subscribe',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body := jsonb_build_object('email', NEW.email, 'user_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block a signup on newsletter sync
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_brevo ON auth.users;
CREATE TRIGGER on_auth_user_created_brevo
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_brevo_subscribe();
