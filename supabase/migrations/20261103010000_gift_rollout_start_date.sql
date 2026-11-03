-- Hold the gift drip until a date we choose, and roll back week 1.
--
-- Week 1 went out early (my mistake — the delivery function was called while
-- testing it, and it acts on everyone eligible, not just a test account). The
-- sequencing matters more than the song: existing users should first hear that
-- Ear Training, chord diagrams and Practice Streaks are now open to them, and
-- only then start receiving a song a week. Two different "come back" messages
-- in the same week compete with each other.
--
-- So: the 118 week-1 copies are removed, and deliveries do not resume until
-- gift_rollout_starts_at. Without the gate, the next nightly run would simply
-- hand week 1 straight back.

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
  v_starts_at date;
  v_delivered integer := 0;
  v_row       record;
  v_new_id    uuid;
BEGIN
  -- Nothing goes out before the rollout date. Set app_config
  -- 'gift_rollout_starts_at' to a past date to begin, or a future one to pause
  -- the whole programme without unscheduling the job.
  SELECT value::date INTO v_starts_at FROM app_config WHERE key = 'gift_rollout_starts_at';
  IF v_starts_at IS NOT NULL AND current_date < v_starts_at THEN
    RETURN jsonb_build_object('delivered', 0, 'paused_until', v_starts_at);
  END IF;

  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';
  SELECT value INTO v_anon FROM app_config WHERE key = 'anon_key';

  FOR v_row IN
    -- DISTINCT ON gives each person their LOWEST outstanding week and nothing
    -- more, so the sequence is always walked in order, one at a time.
    SELECT DISTINCT ON (u.id) u.id AS user_id, g.week, g.analysis_id, g.label
    FROM auth.users u
    JOIN gift_songs g
      -- A week's gift falls due once the account is that many weeks old.
      ON u.created_at <= now() - (g.week * interval '7 days')
    JOIN subscriptions s ON s.user_id = u.id
    WHERE s.plan_type = 'free'          -- paid plans already have their volume
      AND NOT EXISTS (
        SELECT 1 FROM gift_deliveries d
        WHERE d.user_id = u.id AND d.week = g.week
      )
      -- Never two gifts in the same week, however old the account is.
      AND NOT EXISTS (
        SELECT 1 FROM gift_deliveries d
        WHERE d.user_id = u.id AND d.delivered_at > now() - interval '7 days'
      )
    ORDER BY u.id, g.week
    -- A gentle ramp: mailing the whole dormant back catalogue in one burst is
    -- how a sending domain gets itself marked as spam.
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
