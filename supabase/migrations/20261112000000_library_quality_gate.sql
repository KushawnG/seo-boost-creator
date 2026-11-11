-- The chord library is the site's search surface, and it has been growing
-- unsupervised: every completed YouTube analysis became a public page. Four
-- months in, about a fifth of the 77 pages are titles nobody will ever search
-- for — promo clips, "type beats", a freestyle, titles in scripts the English
-- page copy can't describe, artist and title the wrong way round. Pages like
-- that don't just fail to rank; they make the pages next to them look like
-- part of a spam catalogue. So: a gate on what gets published from now on,
-- and a clean-up of what already was.

-- Slugs lost their accented letters ("ángel" became "ngel-maia-reficco").
-- Installed into the extensions schema, as Supabase expects, and called with
-- that prefix because publish_song_from_analysis pins search_path to public.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.library_title_ok(p_title text, p_artist text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_both    text := coalesce(p_title, '') || ' ' || coalesce(p_artist, '');
  v_letters integer;
  v_latin   integer;
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) < 2 OR length(p_title) > 80 THEN
    RETURN false;
  END IF;

  -- Artist and title identical means the parser found nothing to split on.
  IF p_artist IS NOT NULL AND lower(trim(p_artist)) = lower(trim(p_title)) THEN
    RETURN false;
  END IF;

  -- Emoji, dingbats and "𝑶𝒓𝒚𝒏𝒕𝒉𝒂𝒍𝒆"-style mathematical letters are fan-upload
  -- styling, never how an artist or a label titles a release.
  IF v_both ~ '[\U0001D400-\U0001D7FF\U0001F000-\U0001FAFF☀-➿⬀-⯿]' THEN
    RETURN false;
  END IF;

  -- Hashtags and slashes come from medleys, mashups and event tags
  -- ("Golden #2025MAMA", "Deja Vu/Partition").
  IF v_both ~ '[#/]' THEN
    RETURN false;
  END IF;

  -- The page copy is English and the audience searches in Latin script. A
  -- title with no Latin letters can't be described, let alone found.
  SELECT length(regexp_replace(v_both, '[^[:alpha:]]', '', 'g')),
         length(regexp_replace(v_both, '[^A-Za-zÀ-ɏ]', '', 'g'))
    INTO v_letters, v_latin;
  IF v_letters = 0 OR v_latin::numeric / v_letters < 0.7 THEN
    RETURN false;
  END IF;

  -- Not a recording of a song: promos, beats for sale, medleys, and
  -- altered-tempo edits whose BPM is wrong for the original.
  IF v_both ~* '\m(type beat|freestyle|lyric edit|comes out|out now|teaser|trailer|snippet|mashup|medley|8d audio|slowed|sped up|nightcore|reverb)\M' THEN
    RETURN false;
  END IF;

  RETURN true;
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

  -- Main chords: top 5 by played time, but only chords the pipeline kept in
  -- a.chords (that list is already de-flickered), spelled to match the key.
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
  IF position(' - ' IN v_head) > 0 THEN
    v_artist := trim(split_part(v_head, ' - ', 1));
    v_title  := trim(substring(v_head FROM position(' - ' IN v_head) + 3));
  ELSE
    v_title  := v_head;
    v_artist := trim(regexp_replace(v_channel, '(VEVO|\s*-\s*Topic|\s+Music|\s+Official)+$', '', 'g'));
  END IF;
  v_title := trim(regexp_replace(v_title, '\s*[\(\[][^\)\]]*[\)\]]', '', 'g'));
  -- "Skankin Sweet Lyrics" is a lyric video of "Skankin Sweet", not a song
  -- called that.
  v_title := trim(regexp_replace(v_title, '\s+(official\s+)?lyrics?\s*$', '', 'i'));
  v_title := trim(regexp_replace(v_title, '\s+', ' ', 'g'));
  IF v_title IS NULL OR v_title = '' THEN v_title := a.title; END IF;

  -- The analysis itself is untouched; it just doesn't become a public page.
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

-- ---------------------------------------------------------------------------
-- Clean-up of what was already published. Unpublished, not deleted: the rows
-- keep their youtube_id, so the same video can't be re-published by a later
-- analysis, and a human can always flip one back.
-- ---------------------------------------------------------------------------
-- Everything the gate would have refused — at the time of writing: a Thai, a
-- Japanese, a Hebrew and three Assamese titles; a "type beat"; a freestyle; a
-- fan "lyric edit"; a promo clip; an award-show medley tag; a title that was
-- its own artist; two with mangled artist/title splits. Driven by the gate
-- rather than a hand-typed list of slugs, so the clean-up and the rule can't
-- disagree.
UPDATE public.public_songs
   SET published = false
 WHERE published
   AND NOT public.library_title_ok(title, artist);

-- One the gate can't see: "Worship" by a church is a valid-looking title that
-- isn't a song.
UPDATE public.public_songs SET published = false
 WHERE slug = 'worship-faith-apostolic-christian-assembly';

-- Real songs the parser got backwards or decorated. Slugs are kept: none of
-- these URLs has been indexed, and the slug already contains both names.
UPDATE public.public_songs SET title = 'God Will Make a Way', artist = 'Don Moen'
  WHERE slug = 'don-moen-god-will-make-a-way';
UPDATE public.public_songs SET title = 'Closer', artist = 'Uncle Austin, Meddy & Yvan Buravan'
  WHERE slug = 'uncle-austin-meddy-yvan-buravan-closer';
UPDATE public.public_songs SET title = 'Burinde Bucya', artist = 'Meddy'
  WHERE slug = 'meddy-burinde-bucya';
UPDATE public.public_songs SET title = 'Skankin Sweet'
  WHERE slug = 'skankin-sweet-lyrics-chronixx';
UPDATE public.public_songs SET title = 'Nic nie ma'
  WHERE slug = 'nic-nie-ma-mau-mau';

-- Slugs that dropped their accented letters. These URLs do change, but they
-- were never indexed and the sitemap regenerates on the next deploy.
UPDATE public.public_songs SET slug = 'angel-maia-reficco'
  WHERE slug = 'ngel-maia-reficco';
UPDATE public.public_songs SET slug = 'dos-extranos-fabio-lazaro'
  WHERE slug = 'dos-extra-os-fabio-l-zaro';
