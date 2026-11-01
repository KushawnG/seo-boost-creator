-- Stop throwing away a download that is still running.
--
-- Extraction called Apify's run-sync endpoint, which blocks until the download
-- finishes. A worker only lives ~150s, so a genuinely slow source could never
-- complete — and retrying did not help, because each retry started a BRAND NEW
-- download that was just as slow. That was the last live cause of failed
-- analyses ("The run deadline was reached before this video finished").
--
-- An Apify run keeps going on Apify's servers after our worker dies. So the
-- fix is simply to remember which run we started: the next worker polls the
-- run that has been making progress all along instead of starting over.

ALTER TABLE public.song_analysis
  ADD COLUMN IF NOT EXISTS apify_run_id text;

COMMENT ON COLUMN public.song_analysis.apify_run_id IS
  'Apify actor run fetching this song''s audio. Set as soon as the run starts so a later worker can resume polling it rather than re-downloading.';

-- Extraction can now be resumed too, not just transcription. A row that is
-- still 'pending' with no audio yet is picked up the same way an 'extracted'
-- row is, and the worker it wakes carries on polling its existing Apify run.
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
  SELECT value INTO v_anon FROM app_config WHERE key = 'anon_key';

  IF v_base IS NOT NULL AND v_secret IS NOT NULL AND v_anon IS NOT NULL THEN
    FOR v_row IN
      SELECT id,
             -- 'extracted' means the audio is in hand and only Klangio is left;
             -- 'pending' means we are still fetching it.
             CASE WHEN status = 'extracted' THEN 'transcribe' ELSE 'extract' END AS stage
      FROM song_analysis
      WHERE created_at > now() - p_give_up
        AND updated_at < now() - p_stale
        AND (
          (status = 'extracted' AND file_path IS NOT NULL)
          -- Only resume a fetch we can actually continue: without a run id
          -- there is nothing in flight and a retry would just repeat whatever
          -- already failed.
          OR (status = 'pending' AND file_path IS NULL AND apify_run_id IS NOT NULL)
        )
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
        body    := jsonb_build_object('analysisId', v_row.id, 'stage', v_row.stage),
        timeout_milliseconds := 5000
      );

      -- Touch the row so this attempt is recorded and the next retry waits.
      UPDATE song_analysis SET status = status WHERE id = v_row.id;
      v_retried := v_retried + 1;
    END LOOP;
  ELSE
    RAISE LOG 'recover_stalled_analyses: no functions_base_url or internal_fn_secret — retries disabled';
  END IF;

  WITH given_up AS (
    UPDATE song_analysis
    SET status = 'failed',
        error_message = CASE
          WHEN status = 'extracted' THEN
            'We got the audio but couldn''t finish working out the chords. Please try this song again — you weren''t charged a credit.'
          ELSE
            'We couldn''t get this song''s audio from YouTube in time. Please try again, or upload the audio file instead — you weren''t charged a credit.'
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
