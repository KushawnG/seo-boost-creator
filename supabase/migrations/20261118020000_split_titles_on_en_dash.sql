-- Split "Artist – Title" on an en dash as well as a hyphen.
--
-- The parser only knew " - ". YouTube titles use " – " just as often, so
-- "Queen – Bohemian Rhapsody" was treated as one long title and the artist was
-- taken from the channel instead, publishing a library page titled "Queen –
-- Bohemian Rhapsody" by "Queen". Found when the song was analysed during the
-- 2026-11-18 audit.
--
-- The em dash " — " keeps its existing job of separating the channel suffix,
-- so only the en dash is added here.

CREATE OR REPLACE FUNCTION public.split_artist_title(p_head text)
RETURNS TABLE (artist text, title text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sep text;
  v_pos integer;
BEGIN
  -- Whichever separator appears first wins, so a title containing the other
  -- character later on can't hijack the split.
  FOR v_sep IN SELECT unnest(ARRAY[' - ', ' – ']) LOOP
    v_pos := position(v_sep IN p_head);
    IF v_pos > 0 AND (artist IS NULL OR v_pos < position(coalesce(artist, '') IN p_head)) THEN
      artist := trim(left(p_head, v_pos - 1));
      title  := trim(substring(p_head FROM v_pos + length(v_sep)));
    END IF;
  END LOOP;
  IF artist IS NULL THEN
    artist := NULL;
    title  := trim(p_head);
  END IF;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.publish_song_from_analysis(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a public.song_analysis;
  v_head text; v_channel text; v_artist text; v_title text; v_slug text; v_final_slug text;
  v_chords text[]; v_prog text[];
BEGIN
  SELECT * INTO a FROM public.song_analysis WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF coalesce(a.is_demo,false) OR a.youtube_id IS NULL OR a.status <> 'completed'
     OR a.key IS NULL OR a.bpm IS NULL OR coalesce(array_length(a.chords,1),0) < 2 THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_songs WHERE youtube_id = a.youtube_id) THEN RETURN; END IF;

  SELECT array_agg(public.spell_for_key(fmt, a.key) ORDER BY dur DESC) INTO v_chords FROM (
    SELECT
      CASE WHEN e->>2 LIKE '%:maj' THEN replace(e->>2, ':maj','')
           WHEN e->>2 LIKE '%:min' THEN replace(e->>2, ':min','m')
           ELSE replace(e->>2, ':', '') END AS fmt,
      sum(greatest((e->>1)::numeric - (e->>0)::numeric, 0)) AS dur
    FROM jsonb_array_elements(a.chords_timeline::jsonb) e
    WHERE e->>2 IS NOT NULL AND e->>2 <> 'N'
      AND (a.chords IS NULL OR (e->>2) = ANY(a.chords))
    GROUP BY 1 ORDER BY dur DESC LIMIT 5
  ) t;
  IF coalesce(array_length(v_chords,1),0) < 2 THEN RETURN; END IF;

  IF coalesce(array_length(a.main_progression,1),0) > 1 THEN
    SELECT array_agg(
             public.spell_for_key(
               CASE WHEN c LIKE '%:maj' THEN replace(c, ':maj','')
                    WHEN c LIKE '%:min' THEN replace(c, ':min','m')
                    ELSE replace(c, ':', '') END,
               a.key)
             ORDER BY i)
      INTO v_prog
      FROM unnest(a.main_progression) WITH ORDINALITY AS u(c, i);
  ELSE
    v_prog := public.main_progression(a.chords_timeline::jsonb, a.key);
  END IF;

  -- title looks like "Artist - Title (junk) — Channel"; split on the last em dash
  v_channel := trim(regexp_replace(a.title, '^.*\s+—\s+', ''));
  v_head    := trim(regexp_replace(a.title, '\s+—\s+[^—]*$', ''));
  IF v_head = a.title THEN v_channel := ''; END IF;
  v_head := regexp_replace(v_head, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g');
  v_head := regexp_replace(v_head, '\s*\|.*$', '');
  v_head := trim(translate(v_head, '"''“”', ''));

  SELECT s.artist, s.title INTO v_artist, v_title FROM public.split_artist_title(v_head) s;
  IF v_artist IS NULL THEN
    v_artist := trim(regexp_replace(v_channel, '(VEVO|\s*-\s*Topic|\s+Music|\s+Official)+$', '', 'g'));
  END IF;

  v_title := trim(regexp_replace(v_title, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g'));
  v_title := trim(regexp_replace(v_title, '\s+(official\s+)?lyrics?\s*$', '', 'i'));
  v_title := trim(regexp_replace(v_title, '\s+', ' ', 'g'));
  IF v_title IS NULL OR v_title = '' THEN v_title := a.title; END IF;

  IF NOT public.library_title_ok(v_title, nullif(v_artist, '')) THEN RETURN; END IF;

  v_slug := lower(regexp_replace(
              extensions.unaccent(coalesce(v_title,'') || '-' || coalesce(v_artist,'')),
              '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' FROM v_slug);
  IF v_slug = '' THEN v_slug := 'song'; END IF;
  v_final_slug := v_slug;
  IF EXISTS (SELECT 1 FROM public.public_songs WHERE slug = v_final_slug) THEN
    v_final_slug := v_slug || '-' || left(a.youtube_id, 5);
  END IF;

  INSERT INTO public.public_songs
    (youtube_id, slug, title, artist, song_key, bpm, time_signature, main_chords, main_progression, source_analysis_id)
  VALUES
    (a.youtube_id, v_final_slug, v_title, nullif(v_artist,''), a.key, a.bpm, a.time_signature, v_chords, v_prog, a.id)
  ON CONFLICT (youtube_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $function$;

-- The one row already published with the artist stuck to the front.
UPDATE public.public_songs
   SET title = 'Bohemian Rhapsody', slug = 'bohemian-rhapsody-queen'
 WHERE slug = 'queen-bohemian-rhapsody-queen';
