-- Onboarding demo song: every new user gets a pre-loaded "Three Little Birds"
-- analysis with chord diagrams unlocked (a taste of the paid feature).

-- 1. Flag for demo rows (diagrams unlock on these regardless of plan)
ALTER TABLE public.song_analysis ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- 2. Tiny config store so the trigger/backfill can find the template row
CREATE TABLE IF NOT EXISTS public.app_config (key TEXT PRIMARY KEY, value TEXT);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY; -- service-role only

-- 3. Let any authenticated user read the shared demo audio (demo/ prefix)
DROP POLICY IF EXISTS "Anyone can read demo audio" ON storage.objects;
CREATE POLICY "Anyone can read demo audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'audio_files' AND (storage.foldername(name))[1] = 'demo');

-- 4. Finalize the seeded template row (shared audio path + mark as demo)
UPDATE public.song_analysis
  SET file_path = 'demo/three-little-birds.mp3', is_demo = true, status = 'completed'
  WHERE id = '1cd5f750-1dcc-4e0b-8281-1daa4a15a8f5';

-- 5. Record which row is the template
INSERT INTO public.app_config (key, value)
  VALUES ('demo_analysis_id', '1cd5f750-1dcc-4e0b-8281-1daa4a15a8f5')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- 6. Clone the demo into every new signup (never block signup on failure)
CREATE OR REPLACE FUNCTION public.handle_new_user_demo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE demo_id uuid;
BEGIN
  BEGIN
    SELECT value::uuid INTO demo_id FROM public.app_config WHERE key = 'demo_analysis_id';
    IF demo_id IS NULL THEN RETURN NEW; END IF;
    INSERT INTO public.song_analysis
      (user_id, title, chords, chords_timeline, beats, key, bpm, time_signature, duration, file_path, url, youtube_id, status, is_demo)
    SELECT NEW.id, title, chords, chords_timeline, beats, key, bpm, time_signature, duration, file_path, url, youtube_id, 'completed', true
    FROM public.song_analysis WHERE id = demo_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_demo ON auth.users;
CREATE TRIGGER on_auth_user_created_demo
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_demo();

-- 7. Backfill: give existing users the demo too (skip the demo account + anyone who already has one)
INSERT INTO public.song_analysis
  (user_id, title, chords, chords_timeline, beats, key, bpm, time_signature, duration, file_path, url, youtube_id, status, is_demo)
SELECT u.id, d.title, d.chords, d.chords_timeline, d.beats, d.key, d.bpm, d.time_signature, d.duration, d.file_path, d.url, d.youtube_id, 'completed', true
FROM auth.users u
CROSS JOIN (SELECT * FROM public.song_analysis WHERE id = '1cd5f750-1dcc-4e0b-8281-1daa4a15a8f5') d
WHERE u.id <> '0cd623b2-292f-4ab1-b28d-7ae38bde9be2'
  AND NOT EXISTS (SELECT 1 FROM public.song_analysis s WHERE s.user_id = u.id AND s.is_demo = true);
