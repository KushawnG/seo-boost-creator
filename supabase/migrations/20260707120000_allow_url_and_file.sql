-- YouTube analyses now also store the extracted audio in storage, so a row
-- may have both url and file_path. Keep requiring at least one source.
ALTER TABLE public.song_analysis
  DROP CONSTRAINT IF EXISTS either_url_or_file_path;

ALTER TABLE public.song_analysis
  ADD CONSTRAINT has_audio_source CHECK (url IS NOT NULL OR file_path IS NOT NULL);
