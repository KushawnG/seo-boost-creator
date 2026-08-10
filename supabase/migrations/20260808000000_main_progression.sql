-- The chord library should show the song's MAIN PROGRESSION (the loop that
-- repeats through most of the song), not just its most-used chords.
-- Also spell chords to match the key, so a song in F major shows Bb, not A#.

ALTER TABLE public.public_songs ADD COLUMN IF NOT EXISTS main_progression TEXT[];

-- Klangio always spells accidentals as sharps. Musicians read flat keys in
-- flats, so re-spell to match the key signature (Eb major -> Ab, not G#).
CREATE OR REPLACE FUNCTION public.spell_for_key(p_chord text, p_key text)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_chord IS NULL THEN NULL
    WHEN lower(coalesce(p_key,'')) ~ '^(f major|bb major|eb major|ab major|db major|gb major|cb major|d minor|g minor|c minor|f minor|bb minor|eb minor|ab minor)$'
      THEN replace(replace(replace(replace(replace(p_chord,
             'A#','Bb'), 'C#','Db'), 'D#','Eb'), 'F#','Gb'), 'G#','Ab')
    ELSE replace(replace(replace(replace(replace(p_chord,
             'Bb','A#'), 'Db','C#'), 'Eb','D#'), 'Gb','F#'), 'Ab','G#')
  END;
$$;

-- Find the repeated chord cycle that covers the most of a song.
--
-- Klangio over-detects passing chords, so the sequence is first filtered to the
-- chords that actually carry the song (>=4% of played time), then consecutive
-- repeats are collapsed — "G G G D D Em" is one G, one D, one Em. Candidate
-- cycles of length 2..8 are scored by how many chord slots they cover
-- (occurrences x length). A candidate whose own minimal period is shorter than
-- itself ("Em C G Em C G Em C" really being "Em C G") is rejected, so the
-- shortest true loop wins instead of a padded copy of it.
CREATE OR REPLACE FUNCTION public.main_progression(p_timeline jsonb, p_key text DEFAULT NULL)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  seq text[];
  n int; L int; max_len int; p int;
  cand text[]; cnt int; score numeric;
  best text[] := NULL; best_score numeric := 0;
  periodic boolean;
BEGIN
  WITH spans AS (
    SELECT e.ord,
           CASE WHEN e.val->>2 LIKE '%:maj' THEN replace(e.val->>2, ':maj', '')
                WHEN e.val->>2 LIKE '%:min' THEN replace(e.val->>2, ':min', 'm')
                ELSE replace(e.val->>2, ':', '') END AS fmt,
           greatest((e.val->>1)::numeric - (e.val->>0)::numeric, 0) AS dur
    FROM jsonb_array_elements(p_timeline) WITH ORDINALITY AS e(val, ord)
    WHERE e.val->>2 IS NOT NULL AND e.val->>2 <> 'N'
  ), totals AS (
    SELECT fmt, sum(dur) AS chord_dur FROM spans GROUP BY fmt
  ), kept AS (                              -- drop noise / passing chords
    SELECT fmt FROM totals
    WHERE chord_dur >= 0.04 * (SELECT sum(chord_dur) FROM totals)
  ), collapsed AS (
    SELECT ord, fmt, lag(fmt) OVER (ORDER BY ord) AS prev
    FROM spans WHERE fmt IN (SELECT fmt FROM kept)
  )
  SELECT array_agg(fmt ORDER BY ord) INTO seq
  FROM collapsed WHERE prev IS DISTINCT FROM fmt;

  n := coalesce(array_length(seq, 1), 0);
  IF n < 4 THEN RETURN NULL; END IF;

  max_len := least(8, n / 2);
  FOR L IN 2..max_len LOOP
    SELECT gram, c INTO cand, cnt FROM (
      SELECT seq[i:i + L - 1] AS gram, count(*) AS c, min(i) AS first_i
      FROM generate_series(1, n - L + 1) AS i
      GROUP BY seq[i:i + L - 1]
    ) g ORDER BY c DESC, first_i ASC LIMIT 1;

    IF cnt < 2 THEN CONTINUE; END IF;

    -- Reject a candidate that is a shorter cycle written out more than once.
    periodic := false;
    FOR p IN 1..(L - 1) LOOP
      IF (SELECT bool_and(cand[i] = cand[i + p]) FROM generate_series(1, L - p) AS i) THEN
        periodic := true;
        EXIT;
      END IF;
    END LOOP;
    IF periodic THEN CONTINUE; END IF;

    score := cnt * L;
    IF score > best_score THEN
      best_score := score;
      best := cand;
    END IF;
  END LOOP;

  -- Only claim a "main progression" when the loop really does carry the song.
  IF best IS NULL OR best_score < n * 0.30 THEN RETURN NULL; END IF;

  RETURN (SELECT array_agg(public.spell_for_key(c, p_key) ORDER BY i)
          FROM unnest(best) WITH ORDINALITY AS u(c, i));
END $$;

-- Publish the progression alongside the main chords.
CREATE OR REPLACE FUNCTION public.publish_song_from_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- main chords: top 5 by total time, formatted and spelled for the key
  SELECT array_agg(public.spell_for_key(fmt, a.key) ORDER BY dur DESC) INTO v_chords FROM (
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

  v_prog := public.main_progression(a.chords_timeline::jsonb, a.key);

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
    (youtube_id, slug, title, artist, song_key, bpm, time_signature, main_chords, main_progression, source_analysis_id)
  VALUES
    (a.youtube_id, v_final_slug, v_title, nullif(v_artist,''), a.key, a.bpm, a.time_signature, v_chords, v_prog, a.id)
  ON CONFLICT (youtube_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Backfill progressions (and key-correct chord spellings) for existing rows.
UPDATE public.public_songs p
SET main_progression = public.main_progression(a.chords_timeline::jsonb, p.song_key),
    main_chords = (
      SELECT array_agg(public.spell_for_key(c, p.song_key) ORDER BY i)
      FROM unnest(p.main_chords) WITH ORDINALITY AS u(c, i)
    )
FROM public.song_analysis a
WHERE a.id = p.source_analysis_id;
