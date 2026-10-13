-- The watchdog was racing live work and calling it a stall.
--
-- recover_stalled_analyses re-kicked any 'extracted' row whose updated_at was
-- older than 90 seconds. But a transcription worker lives for up to ~150
-- seconds, and leg two writes nothing to the row between starting and
-- finishing — so a perfectly healthy job that needed more than 90 seconds
-- looked stale, and the watchdog started a SECOND transcription on top of it.
--
-- That is self-amplifying. Each duplicate re-uploads the whole audio file to
-- Klangio twice (beat tracking and chord recognition run in parallel), which
-- competes for the plan's 2 requests/second, which makes every attempt slower,
-- which makes the next one look stale too. A 3.2MB upload on 2026-10-13 was
-- re-kicked at 06:12:59, 06:14:29 and 06:16:00 and never finished; the user was
-- told we couldn't work out the chords. The same file transcribes in 12
-- seconds when nothing is fighting it.
--
-- The invariant that was missing: NEVER retry before the previous attempt is
-- guaranteed dead. A worker cannot outlive ~150s, so the retry delay has to be
-- comfortably longer than that.

CREATE OR REPLACE FUNCTION public.recover_stalled_analyses(
  p_stale    interval DEFAULT interval '3 minutes',
  p_give_up  interval DEFAULT interval '12 minutes'
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
