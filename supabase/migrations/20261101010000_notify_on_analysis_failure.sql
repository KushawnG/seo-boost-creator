-- Email the owner the moment an analysis fails.
--
-- The reason this is worth wiring up: a 43% failure rate ran through August
-- and September without anyone knowing, because nothing surfaced a failure
-- except a user complaining. Three separate root causes were found only by
-- going looking. An alert per failure turns that into something noticed the
-- same day.
--
-- Deliberately NOT sent for "No credits remaining" — that is the paywall
-- working, and it was historically the single most common entry in this table
-- (15 of 67). Alerts that cry wolf get filtered away, and then the real ones
-- are missed too.

CREATE OR REPLACE FUNCTION public.trg_notify_analysis_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base   text;
  v_secret text;
BEGIN
  IF NEW.status <> 'failed' OR COALESCE(OLD.status, '') = 'failed' THEN
    RETURN NEW;
  END IF;

  -- The paywall is not a fault.
  IF COALESCE(NEW.error_message, '') LIKE 'No credits%'
     OR COALESCE(NEW.error_message, '') LIKE 'The free analysis limit%' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';
  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE LOG 'trg_notify_analysis_failure: not configured, skipping';
    RETURN NEW;
  END IF;

  -- pg_net queues the request, so this never holds up the transaction that is
  -- recording the failure. A notification that fails must not become a second
  -- failure.
  PERFORM net.http_post(
    url     := v_base || '/notify-analysis-failure',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-internal-secret', v_secret
               ),
    body    := jsonb_build_object('analysisId', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let alerting break the pipeline it is watching.
  RAISE LOG 'trg_notify_analysis_failure: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_song_analysis_failed ON public.song_analysis;

CREATE TRIGGER on_song_analysis_failed
  AFTER UPDATE OF status ON public.song_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_analysis_failure();
