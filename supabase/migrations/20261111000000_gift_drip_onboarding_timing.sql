-- Re-time the gift drip around a new user's first days, and limit it to them.
--
-- A week between gifts was far too slow. 87% of users never return for a
-- second day, so the second gift's whole job is to win that day — and arriving
-- seven days later it arrives after the decision has already been made.
--
-- The intervals now expand rather than repeat: short where the churn is, wider
-- once there is a habit to build on. A song takes more than a day to learn, so
-- handing out a new one every 24 hours would devalue each of them.
--
--   at signup   Three Little Birds   they are already here
--   +24 hours   Upside Down          wins day two
--   +3 days     Stand By Me          two days to play the last one
--   +7 days     Let It Be            carries the first week end to end
--
-- Timing lives in the table, not in this function, so it can be retuned with
-- an UPDATE instead of a deploy.
ALTER TABLE public.gift_songs
  ADD COLUMN IF NOT EXISTS delay interval;

UPDATE public.gift_songs SET delay = interval '24 hours' WHERE week = 1;
UPDATE public.gift_songs SET delay = interval '3 days'   WHERE week = 2;
UPDATE public.gift_songs SET delay = interval '7 days'   WHERE week = 3;

-- Fall back to the old weekly spacing if a row is ever added without a delay,
-- rather than treating NULL as "due immediately".
ALTER TABLE public.gift_songs
  ALTER COLUMN delay SET DEFAULT interval '7 days';
UPDATE public.gift_songs SET delay = (week * interval '7 days') WHERE delay IS NULL;

-- NEW SIGNUPS ONLY. gift_rollout_starts_at now means "only users who joined on
-- or after this", which doubles as the pause switch: set it to a future date
-- and nobody qualifies. The 120 earlier accounts are deliberately excluded —
-- they were mailed three times, opened 37 of those, and came back twice without
-- touching a feature. Continuing to mail that list teaches us nothing and costs
-- sender reputation.
--
-- Kept at the 10th rather than today so the one account that has signed up
-- since (and has already had weeks 0 and 1) stays in the sequence instead of
-- being stranded halfway through it.
INSERT INTO public.app_config (key, value)
VALUES ('gift_rollout_starts_at', '2026-11-10')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.deliver_gift_songs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base      text;
  v_secret    text;
  v_anon      text;
  v_starts_at timestamptz;
  v_delivered integer := 0;
  v_row       record;
  v_new_id    uuid;
BEGIN
  SELECT value::timestamptz INTO v_starts_at
    FROM app_config WHERE key = 'gift_rollout_starts_at';
  IF v_starts_at IS NULL THEN
    RETURN jsonb_build_object('delivered', 0, 'error', 'no rollout date set');
  END IF;

  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';
  SELECT value INTO v_anon FROM app_config WHERE key = 'anon_key';

  FOR v_row IN
    -- DISTINCT ON gives each person their LOWEST outstanding gift and nothing
    -- more, so the sequence is always walked in order, one at a time.
    SELECT DISTINCT ON (u.id) u.id AS user_id, g.week, g.analysis_id, g.label
    FROM auth.users u
    JOIN gift_songs g
      -- Due once the account is older than that gift's delay. Measured from
      -- each person's own signup, so with an hourly job everyone receives
      -- theirs near the hour they signed up — a time they were demonstrably
      -- awake and using the app — rather than at one global clock time.
      ON u.created_at <= now() - g.delay
    JOIN subscriptions s ON s.user_id = u.id
    WHERE s.plan_type = 'free'          -- paid plans already have their volume
      AND u.created_at >= v_starts_at   -- new signups only; also the pause switch
      AND NOT EXISTS (
        SELECT 1 FROM gift_deliveries d
        WHERE d.user_id = u.id AND d.week = g.week
      )
      -- Never two in quick succession, whatever the delays are set to.
      AND NOT EXISTS (
        SELECT 1 FROM gift_deliveries d
        WHERE d.user_id = u.id AND d.delivered_at > now() - interval '20 hours'
      )
    ORDER BY u.id, g.week
    LIMIT 50
  LOOP
    -- main_progression has to be copied explicitly: it is the one column the
    -- app renders its own card from, and leaving it out silently delivered
    -- songs with no progression at all.
    INSERT INTO song_analysis
      (user_id, title, chords, chords_timeline, beats, key, bpm, time_signature,
       duration, file_path, url, youtube_id, status, gift_week, main_progression)
    SELECT v_row.user_id, title, chords, chords_timeline, beats, key, bpm, time_signature,
           duration, file_path, url, youtube_id, 'completed', v_row.week, main_progression
    FROM song_analysis WHERE id = v_row.analysis_id
    RETURNING id INTO v_new_id;

    INSERT INTO gift_deliveries (user_id, week) VALUES (v_row.user_id, v_row.week);
    v_delivered := v_delivered + 1;

    IF v_base IS NOT NULL AND v_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_base || '/notify-gift',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-internal-secret', v_secret
                   ),
        body    := jsonb_build_object('analysisId', v_new_id, 'week', v_row.week),
        timeout_milliseconds := 5000
      );
    END IF;
  END LOOP;

  IF v_delivered > 0 THEN
    RAISE LOG 'deliver_gift_songs: delivered %', v_delivered;
  END IF;
  RETURN jsonb_build_object('delivered', v_delivered);
END $$;

REVOKE ALL ON FUNCTION public.deliver_gift_songs() FROM PUBLIC, anon, authenticated;

-- Hourly, so "24 hours after signup" means roughly that rather than "at the
-- next 15:00 UTC, which might be 3am where you live".
SELECT cron.unschedule('deliver-gift-songs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deliver-gift-songs');

SELECT cron.schedule(
  'deliver-gift-songs',
  '7 * * * *',   -- seven past the hour, clear of the other jobs
  $$SELECT public.deliver_gift_songs()$$
);
