-- Analyses run in a background task, and when that worker is evicted or times
-- out mid-run nothing ever writes a final status: the row sits on 'pending'
-- forever and the dashboard shows "Analyzing…" with no error and no way to
-- retry. Eight rows had been stuck that way for up to two months.
--
-- Credits are only deducted on success, so a stalled run has cost the user
-- nothing — they just need to be told, and allowed to try again.

CREATE OR REPLACE FUNCTION public.fail_stalled_analyses(p_older_than interval DEFAULT interval '20 minutes')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stalled AS (
    UPDATE public.song_analysis
    SET status = 'failed',
        error_message = 'This analysis stopped before it finished — usually a temporary hiccup on our side. Please try it again; you weren''t charged a credit.'
    WHERE status IN ('pending', 'processing')
      AND created_at < now() - p_older_than
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM stalled;

  IF v_count > 0 THEN
    RAISE LOG 'fail_stalled_analyses: closed % stalled analyses', v_count;
  END IF;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.fail_stalled_analyses(interval) FROM PUBLIC, anon, authenticated;

-- Runs often enough that nobody watches a dead spinner for long, and the 20
-- minute floor stays well clear of a legitimately slow Klangio job.
SELECT cron.unschedule('fail-stalled-analyses')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fail-stalled-analyses');

SELECT cron.schedule(
  'fail-stalled-analyses',
  '*/10 * * * *',
  $$SELECT public.fail_stalled_analyses()$$
);

-- Close out the ones already stranded.
SELECT public.fail_stalled_analyses();
