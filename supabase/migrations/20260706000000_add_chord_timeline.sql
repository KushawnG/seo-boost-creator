-- Add timed analysis data for synced chord playback
ALTER TABLE public.song_analysis
  ADD COLUMN IF NOT EXISTS chords_timeline JSONB,
  ADD COLUMN IF NOT EXISTS beats JSONB,
  ADD COLUMN IF NOT EXISTS time_signature TEXT,
  ADD COLUMN IF NOT EXISTS duration REAL,
  ADD COLUMN IF NOT EXISTS youtube_id TEXT;

COMMENT ON COLUMN public.song_analysis.chords_timeline IS 'Array of [startSec, endSec, chordName] from Klangio chord recognition';
COMMENT ON COLUMN public.song_analysis.beats IS 'Array of [timestampSec, beatPositionInBar] from Klangio beat tracking (1.0 = downbeat)';
