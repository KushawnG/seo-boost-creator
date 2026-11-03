-- Tell people in the app that a gift has arrived, once each.
--
-- The email is the primary notice, but open rates being what they are, plenty
-- of people will never see it. A notice on next sign-in catches everyone —
-- shown once per gift, then never again, because after that they know it's
-- there and a repeated popup is just an obstacle between them and the app.

ALTER TABLE public.gift_deliveries
  ADD COLUMN IF NOT EXISTS seen_at timestamptz;

COMMENT ON COLUMN public.gift_deliveries.seen_at IS
  'When the in-app notice for this gift was shown and dismissed. NULL means it is still waiting to be announced.';

-- The demo is week 0 of the same sequence, so give it the same marker and the
-- same delivery record. Without this the announcement logic would need a
-- special case for the one gift everybody gets.
UPDATE public.song_analysis SET gift_week = 0 WHERE is_demo AND gift_week IS NULL;

-- Existing accounts get their week 0 recorded as ALREADY SEEN. They have had
-- the demo since they signed up — announcing it now as news would be odd, and
-- week 1's notice is about to greet them anyway. One popup, not two.
INSERT INTO public.gift_deliveries (user_id, week, delivered_at, seen_at)
SELECT DISTINCT a.user_id, 0, now(), now()
FROM public.song_analysis a
WHERE a.is_demo
ON CONFLICT (user_id, week) DO NOTHING;

-- New signups DO get the week 0 notice: they have never seen the demo before.
CREATE OR REPLACE FUNCTION public.handle_new_user_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE demo_id uuid;
BEGIN
  BEGIN
    SELECT value::uuid INTO demo_id FROM public.app_config WHERE key = 'demo_analysis_id';
    IF demo_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.song_analysis
      (user_id, title, chords, chords_timeline, beats, key, bpm, time_signature,
       duration, file_path, url, youtube_id, status, is_demo, gift_week, main_progression)
    SELECT NEW.id, title, chords, chords_timeline, beats, key, bpm, time_signature,
           duration, file_path, url,
           COALESCE(youtube_id, public.youtube_id_from_url(url)),
           'completed', true, 0, main_progression
    FROM public.song_analysis WHERE id = demo_id;

    -- Unseen, so the app announces it on their first visit.
    INSERT INTO public.gift_deliveries (user_id, week) VALUES (NEW.id, 0)
    ON CONFLICT (user_id, week) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

-- The oldest gift this user has not been told about, with everything the
-- notice needs to describe it. An RPC rather than a view + RLS because the
-- client would otherwise have to join across two tables it can barely see.
CREATE OR REPLACE FUNCTION public.unseen_gift()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(x) FROM (
    SELECT d.week,
           a.id            AS analysis_id,
           a.title,
           a.key,
           a.bpm,
           a.main_progression
    FROM gift_deliveries d
    JOIN song_analysis a
      ON a.user_id = d.user_id AND a.gift_week = d.week
    WHERE d.user_id = auth.uid()
      AND d.seen_at IS NULL
    ORDER BY d.week
    LIMIT 1
  ) x;
$$;

-- Marks it announced. Scoped to the caller, so one user can never dismiss
-- another's notice.
CREATE OR REPLACE FUNCTION public.mark_gift_seen(p_week integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE gift_deliveries
  SET seen_at = now()
  WHERE user_id = auth.uid() AND week = p_week AND seen_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.unseen_gift() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_gift_seen(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unseen_gift() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_gift_seen(integer) TO authenticated;
