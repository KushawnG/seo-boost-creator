-- Public, SEO-friendly chord database. Populated ONLY from public YouTube-sourced
-- analyses (never user file uploads = privacy), minimal data (key/BPM/main chords),
-- no lyrics, no synced timeline (that stays a paid, in-app feature).

CREATE TABLE IF NOT EXISTS public.public_songs (
  youtube_id         TEXT PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  title              TEXT NOT NULL,
  artist             TEXT,
  song_key           TEXT,
  bpm                INT,
  time_signature     TEXT,
  main_chords        TEXT[],
  source_analysis_id UUID,
  published          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.public_songs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read published songs" ON public.public_songs;
CREATE POLICY "Public can read published songs" ON public.public_songs
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE INDEX IF NOT EXISTS idx_public_songs_published ON public.public_songs(published);

-- Normalize one analysis into a public_songs row (best-effort, never throws).
CREATE OR REPLACE FUNCTION public.publish_song_from_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.song_analysis;
  v_head text; v_channel text; v_artist text; v_title text; v_slug text; v_final_slug text;
  v_chords text[];
BEGIN
  SELECT * INTO a FROM public.song_analysis WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF coalesce(a.is_demo,false) OR a.youtube_id IS NULL OR a.status <> 'completed'
     OR a.key IS NULL OR a.bpm IS NULL OR coalesce(array_length(a.chords,1),0) < 2 THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_songs WHERE youtube_id = a.youtube_id) THEN RETURN; END IF;

  -- main chords: top 5 by total time, formatted (A:maj->A, F#:min->F#m)
  SELECT array_agg(fmt ORDER BY dur DESC) INTO v_chords FROM (
    SELECT
      CASE WHEN e->>2 LIKE '%:maj' THEN replace(e->>2, ':maj','')
           WHEN e->>2 LIKE '%:min' THEN replace(e->>2, ':min','m')
           ELSE replace(e->>2, ':', '') END AS fmt,
      sum(greatest((e->>1)::numeric - (e->>0)::numeric, 0)) AS dur
    FROM jsonb_array_elements(a.chords_timeline::jsonb) e
    WHERE e->>2 IS NOT NULL AND e->>2 <> 'N'
    GROUP BY 1 ORDER BY dur DESC LIMIT 5
  ) t;
  IF coalesce(array_length(v_chords,1),0) < 2 THEN RETURN; END IF;

  -- title looks like "Artist - Title (junk) — Channel"; split on the last em dash
  v_channel := trim(regexp_replace(a.title, '^.*\s+—\s+', ''));
  v_head    := trim(regexp_replace(a.title, '\s+—\s+[^—]*$', ''));
  IF v_head = a.title THEN v_channel := ''; END IF;
  v_head := regexp_replace(v_head, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g');
  v_head := regexp_replace(v_head, '\s*\|.*$', '');
  v_head := trim(translate(v_head, '"''“”', ''));
  IF position(' - ' IN v_head) > 0 THEN
    v_artist := trim(split_part(v_head, ' - ', 1));
    v_title  := trim(substring(v_head FROM position(' - ' IN v_head) + 3));
  ELSE
    v_title  := v_head;
    v_artist := trim(regexp_replace(v_channel, '(VEVO|\s*-\s*Topic|\s+Music|\s+Official)+$', '', 'g'));
  END IF;
  v_title := trim(regexp_replace(v_title, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g'));
  v_title := trim(regexp_replace(v_title, '\s+', ' ', 'g'));
  IF v_title IS NULL OR v_title = '' THEN v_title := a.title; END IF;

  v_slug := lower(regexp_replace(coalesce(v_title,'') || '-' || coalesce(v_artist,''), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' FROM v_slug);
  IF v_slug = '' THEN v_slug := 'song'; END IF;
  v_final_slug := v_slug;
  IF EXISTS (SELECT 1 FROM public.public_songs WHERE slug = v_final_slug) THEN
    v_final_slug := v_slug || '-' || left(a.youtube_id, 5);
  END IF;

  INSERT INTO public.public_songs
    (youtube_id, slug, title, artist, song_key, bpm, time_signature, main_chords, source_analysis_id)
  VALUES
    (a.youtube_id, v_final_slug, v_title, nullif(v_artist,''), a.key, a.bpm, a.time_signature, v_chords, a.id)
  ON CONFLICT (youtube_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Auto-add future analyses
CREATE OR REPLACE FUNCTION public.trg_publish_song()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.youtube_id IS NOT NULL AND NOT coalesce(NEW.is_demo,false) THEN
    PERFORM public.publish_song_from_analysis(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_song_analysis_publish ON public.song_analysis;
CREATE TRIGGER on_song_analysis_publish
  AFTER INSERT OR UPDATE OF status ON public.song_analysis
  FOR EACH ROW EXECUTE FUNCTION public.trg_publish_song();

-- Backfill existing qualifying analyses
SELECT public.publish_song_from_analysis(id)
FROM public.song_analysis
WHERE status='completed' AND youtube_id IS NOT NULL AND NOT coalesce(is_demo,false)
  AND key IS NOT NULL AND bpm IS NOT NULL AND coalesce(array_length(chords,1),0) >= 2;
