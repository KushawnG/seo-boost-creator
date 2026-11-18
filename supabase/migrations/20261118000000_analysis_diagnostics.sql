-- Record WHY a download was rejected, not just that it was.
--
-- Found during the 2026-11-18 audit: every one of four label-protected songs
-- (Wonderwall, Bohemian Rhapsody, Shape of You, Hotel California) failed with
-- "the download came back incomplete", and there was no way to tell from the
-- database whether the file was genuinely a fragment or whether the guard that
-- rejects fragments had simply become too strict for the audio the downloader
-- now returns. The numbers existed only in an edge-function console line,
-- which is not queryable here.
--
-- One jsonb column fixes that permanently. It holds machine-readable detail
-- about a failure — measured bytes, claimed duration, implied bitrate, which
-- download route was used — so the next time the pipeline breaks the evidence
-- is already in the row. error_message stays the sentence shown to the user.
ALTER TABLE public.song_analysis
  ADD COLUMN IF NOT EXISTS diagnostics jsonb;

COMMENT ON COLUMN public.song_analysis.diagnostics IS
  'Structured failure detail for debugging (bytes, duration, kbps, route). Written by analyze-song; never shown to users.';
