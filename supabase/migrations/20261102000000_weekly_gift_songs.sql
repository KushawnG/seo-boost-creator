-- A free song dropped into the account each week for the first three weeks,
-- with an email saying it's there.
--
-- 87% of users never came back for a second day. "Come back and practise" is a
-- weak reason to return; "we put a free song in your account" is a concrete
-- one, and it costs nothing — the song is COPIED from an analysis that already
-- exists, exactly like the demo, so there is no Klangio or Apify spend and no
-- credit is consumed.
--
-- The four songs are a deliberate sequence rather than a playlist:
--   week 0  Three Little Birds (the demo)  A  I-IV-V      three chords
--   week 1  Upside Down                    E  I-ii        gentle acoustic
--   week 2  Stand By Me                    A  I-vi-IV-V   adds vi, shapes carry over from week 0
--   week 3  Let It Be                      C  I-V-vi-IV   piano, new key
-- By the end they have I, IV, V and vi in two keys, which is most of pop music.

-- Which analysis is handed out in which week.
CREATE TABLE IF NOT EXISTS public.gift_songs (
  week        integer PRIMARY KEY,
  analysis_id uuid NOT NULL REFERENCES public.song_analysis(id) ON DELETE RESTRICT,
  label       text NOT NULL
);

ALTER TABLE public.gift_songs ENABLE ROW LEVEL SECURITY;  -- service role only

-- What we have actually given each person. Kept separately from the copied row
-- so that deleting the song from their history doesn't make us send it again.
CREATE TABLE IF NOT EXISTS public.gift_deliveries (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week         integer NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week)
);

ALTER TABLE public.gift_deliveries ENABLE ROW LEVEL SECURITY;  -- service role only

-- Marks a row as a gift so it can be told apart from songs the user chose
-- themselves — which matters for the retention numbers, and for the publish
-- trigger below.
ALTER TABLE public.song_analysis
  ADD COLUMN IF NOT EXISTS gift_week integer;

-- Gift copies are duplicates of an analysis that is already in the public
-- library. Without this, every delivery would re-publish the same song and
-- repoint its slug at a copy sitting in one user's account.
CREATE OR REPLACE FUNCTION public.trg_publish_song()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND NEW.youtube_id IS NOT NULL
     AND NOT coalesce(NEW.is_demo, false)
     AND NEW.gift_week IS NULL
  THEN
    PERFORM public.publish_song_from_analysis(NEW.id);
  END IF;
  RETURN NEW;
END $$;

-- Hands out whatever is due, and asks the mailer to tell them about it.
-- Safe to run repeatedly: gift_deliveries is the lock.
CREATE OR REPLACE FUNCTION public.deliver_gift_songs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base      text;
  v_secret    text;
  v_delivered integer := 0;
  v_row       record;
  v_new_id    uuid;
BEGIN
  SELECT value INTO v_base FROM app_config WHERE key = 'functions_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'internal_fn_secret';

  FOR v_row IN
    -- DISTINCT ON gives each person their LOWEST outstanding week and nothing
    -- more, so the sequence is always walked in order, one at a time.
    --
    -- This matters because of the back catalogue: 120 accounts already existed
    -- when this shipped and most were older than three weeks, so a naive query
    -- would have handed every one of them all three gifts at once and sent
    -- ~360 emails in a single run. The seven-day gap below puts existing users
    -- on the same weekly cadence as new ones, starting from whenever they
    -- first become eligible.
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
    -- Copy the finished analysis into their account, exactly as the demo is
    -- seeded. Inserted already 'completed', so no credit is spent and no
    -- worker runs.
    INSERT INTO song_analysis
      (user_id, title, chords, chords_timeline, beats, key, bpm, time_signature,
       duration, file_path, url, youtube_id, status, gift_week)
    SELECT v_row.user_id, title, chords, chords_timeline, beats, key, bpm, time_signature,
           duration, file_path, url, youtube_id, 'completed', v_row.week
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

-- Once a day is plenty: the gift is due on a day boundary, not a minute one.
SELECT cron.unschedule('deliver-gift-songs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deliver-gift-songs');

SELECT cron.schedule(
  'deliver-gift-songs',
  '0 15 * * *',   -- 15:00 UTC — mid-morning in the Americas, evening in Europe
  $$SELECT public.deliver_gift_songs()$$
);
