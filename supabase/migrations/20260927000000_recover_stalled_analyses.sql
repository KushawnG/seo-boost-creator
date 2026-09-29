-- The old watchdog only ever gave up: it failed anything that had sat on
-- 'pending' for 20 minutes. That was the right instinct but the wrong trade —
-- users watched a spinner for twenty minutes before being told to try again,
-- and the audio we had already paid Apify to download was thrown away with it.
--
-- Now that analyze-song splits extraction from transcription (the audio lands
-- in storage and the row reaches 'extracted' in between), a stalled analysis is
-- usually recoverable: re-run the second leg against the stored audio, which
-- costs nothing and takes about half a minute. So this watchdog RETRIES first
-- and only fails what stays stuck.
--
-- Two things make that safe:
--   * updated_at (kept fresh by update_song_analysis_updated_at) is the
--     heartbeat, so a run that is genuinely progressing is never touched;
--   * re-kicking touches the row, which both records the attempt and spaces
--     retries out by p_stale.

-- 'extracted' is the new handoff state between the two legs, and the status
-- CHECK constraint has to admit it or every analysis fails the moment leg one
-- tries to record its progress. 'processing' joins it because the watchdog has
-- always claimed to handle that state and the constraint never allowed it.
ALTER TABLE public.song_analysis
  DROP CONSTRAINT IF EXISTS song_analysis_status_check;

ALTER TABLE public.song_analysis
  ADD CONSTRAINT song_analysis_status_check
  CHECK (status = ANY (ARRAY['pending', 'processing', 'extracted', 'completed', 'failed']));

CREATE OR REPLACE FUNCTION public.recover_stalled_analyses(
  p_stale    interval DEFAULT interval '90 seconds',
  p_give_up  interval DEFAULT interval '6 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base    text;
  v_secret  text;
  v_anon    text;
  v_retried integer := 0;
  v_failed  integer := 0;
  v_row     record;
BEGIN
  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';
  -- The gateway rejects a call with no Authorization header before the function
  -- ever runs (a 401 that looked like a successful retry from in here). Any
  -- valid project JWT satisfies it, so use the PUBLIC anon key — the real
  -- authorization is the internal secret the function checks itself, and this
  -- keeps the service role key out of the database.
  SELECT value INTO v_anon FROM app_config WHERE key = 'anon_key';

  -- Resume anything that got the audio but never finished transcribing.
  IF v_base IS NOT NULL AND v_secret IS NOT NULL AND v_anon IS NOT NULL THEN
    FOR v_row IN
      SELECT id FROM song_analysis
      WHERE status = 'extracted'
        AND file_path IS NOT NULL
        AND updated_at < now() - p_stale
        AND created_at > now() - p_give_up
      ORDER BY created_at
      LIMIT 20
    LOOP
      PERFORM net.http_post(
        url     := v_base || '/analyze-song',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-internal-secret', v_secret,
                     'apikey', v_anon,
                     'Authorization', 'Bearer ' || v_anon
                   ),
        body    := jsonb_build_object('analysisId', v_row.id),
        timeout_milliseconds := 5000
      );

      -- Touch the row so this attempt is recorded and the next retry waits.
      UPDATE song_analysis SET status = 'extracted' WHERE id = v_row.id;
      v_retried := v_retried + 1;
    END LOOP;
  ELSE
    RAISE LOG 'recover_stalled_analyses: no functions_base_url or internal_fn_secret — retries disabled';
  END IF;

  -- Whatever is still unfinished past the deadline gets an honest error and a
  -- clear invitation to retry. Credits are only spent on success, so nobody
  -- who lands here has been charged.
  WITH given_up AS (
    UPDATE song_analysis
    SET status = 'failed',
        error_message = CASE
          WHEN status = 'extracted' THEN
            'We got the audio but couldn''t finish working out the chords. Please try this song again — you weren''t charged a credit.'
          ELSE
            'This analysis stopped before it finished — usually a temporary hiccup on our side. Please try it again; you weren''t charged a credit.'
        END
    WHERE status IN ('pending', 'processing', 'extracted')
      AND updated_at < now() - p_give_up
    RETURNING 1
  )
  SELECT count(*) INTO v_failed FROM given_up;

  IF v_retried > 0 OR v_failed > 0 THEN
    RAISE LOG 'recover_stalled_analyses: retried %, failed %', v_retried, v_failed;
  END IF;

  RETURN jsonb_build_object('retried', v_retried, 'failed', v_failed);
END $$;

REVOKE ALL ON FUNCTION public.recover_stalled_analyses(interval, interval) FROM PUBLIC, anon, authenticated;

-- Every 30s: a stall should cost a user seconds, not a coffee break. pg_cron
-- 1.5+ accepts sub-minute schedules.
SELECT cron.unschedule('fail-stalled-analyses')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fail-stalled-analyses');

SELECT cron.unschedule('recover-stalled-analyses')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recover-stalled-analyses');

SELECT cron.schedule(
  'recover-stalled-analyses',
  '30 seconds',
  $$SELECT public.recover_stalled_analyses()$$
);

-- Superseded by the function above; drop it so there's one watchdog, not two.
DROP FUNCTION IF EXISTS public.fail_stalled_analyses(interval);
