-- Stop sending gift songs to accounts that were never a person.
--
-- Between 10 and 18 November 2026, twenty accounts registered and did
-- absolutely nothing: no second session (last_sign_in_at equal to created_at
-- to the second), no analysis, no practice, and the demo popup never
-- dismissed. The addresses were Gmail dot-tricks and scraped-looking
-- corporate ones. Thirty gift emails had already gone out to them, and every
-- signup is also pushed to the Brevo marketing list — which is how a sending
-- domain gets itself burned.
--
-- WHAT THIS DOES NOT DO: gate on engagement. The drip exists precisely for
-- people who signed up and did not come back — 87% of them — so requiring an
-- analysis or a return visit would aim it away from its own audience. The
-- question here is narrower and fairer: did this account come from the app at
-- all? A person uses the sign-up form, which now sends signup_source = 'web';
-- a script posting to the auth endpoint carries nothing.
--
-- Captcha is the real defence and is being switched on separately. This is
-- the cheap second lock: even if a bot gets an account, it does not get mail.

ALTER TABLE public.signup_attribution
  ADD COLUMN IF NOT EXISTS signup_source text;

-- Record the marker the sign-up form now sends.
CREATE OR REPLACE FUNCTION public.handle_new_user_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.signup_attribution (
      user_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      fbclid, referrer, landing_page, signup_source
    )
    VALUES (
      NEW.id,
      nullif(NEW.raw_user_meta_data->>'utm_source', ''),
      nullif(NEW.raw_user_meta_data->>'utm_medium', ''),
      nullif(NEW.raw_user_meta_data->>'utm_campaign', ''),
      nullif(NEW.raw_user_meta_data->>'utm_content', ''),
      nullif(NEW.raw_user_meta_data->>'utm_term', ''),
      nullif(NEW.raw_user_meta_data->>'fbclid', ''),
      nullif(NEW.raw_user_meta_data->>'referrer', ''),
      nullif(NEW.raw_user_meta_data->>'landing_page', ''),
      nullif(NEW.raw_user_meta_data->>'signup_source', '')
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- never let attribution capture roll back user creation
    NULL;
  END;
  RETURN NEW;
END;
$function$;

-- Anyone who signed up before the marker existed is judged on behaviour
-- instead, so the change can't silently cut off real people mid-sequence.
CREATE OR REPLACE FUNCTION public.looks_like_a_person(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Came through the sign-up form.
    EXISTS (
      SELECT 1 FROM signup_attribution a
      WHERE a.user_id = p_user_id AND a.signup_source IS NOT NULL
    )
    -- Or did something only a person does.
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p_user_id
        AND u.last_sign_in_at > u.created_at + interval '60 seconds'
    )
    OR EXISTS (
      SELECT 1 FROM gift_deliveries d
      WHERE d.user_id = p_user_id AND d.seen_at IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM song_analysis s
      WHERE s.user_id = p_user_id AND s.gift_week IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM practice_log p WHERE p.user_id = p_user_id
    );
$$;

REVOKE ALL ON FUNCTION public.looks_like_a_person(uuid) FROM PUBLIC, anon, authenticated;

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
      AND public.looks_like_a_person(u.id)
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
