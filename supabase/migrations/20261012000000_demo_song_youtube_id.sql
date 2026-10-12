-- The demo song never showed its video.
--
-- AnalysisDetail and EarTrainingView render the YouTube embed when the
-- analysis has a youtube_id, and fall back to a bare <audio> progress bar when
-- it doesn't. The demo analysis was seeded with its url but no youtube_id, and
-- handle_new_user_demo copies the template column-for-column — so all 114
-- demo rows inherited the null and every single new user's first experience of
-- play-along was the progress bar instead of the video. Real analyses were
-- never affected (77 of 77 carry their id), which is why this looked like the
-- player was missing rather than the data being incomplete.
--
-- Fixed in three parts: recover the id from the url it was always sitting in,
-- backfill the copies, and stop the seeder depending on the template being
-- right.

-- Same pattern the client uses (src/lib/youtube.ts), kept here so the database
-- can repair a row without a round trip through the app.
CREATE OR REPLACE FUNCTION public.youtube_id_from_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(
    p_url from '(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})'
  );
$$;

-- 1. Every analysis that came from a YouTube link but lost its id.
UPDATE public.song_analysis
SET youtube_id = public.youtube_id_from_url(url)
WHERE youtube_id IS NULL
  AND url IS NOT NULL
  AND public.youtube_id_from_url(url) IS NOT NULL;

-- 2. Seed future demos defensively: derive the id when the template lacks one,
--    so a mis-seeded template can never silently cost every new user the video
--    again.
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
       duration, file_path, url, youtube_id, status, is_demo)
    SELECT NEW.id, title, chords, chords_timeline, beats, key, bpm, time_signature,
           duration, file_path, url,
           COALESCE(youtube_id, public.youtube_id_from_url(url)),
           'completed', true
    FROM public.song_analysis WHERE id = demo_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;
