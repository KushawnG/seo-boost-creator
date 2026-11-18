-- Respell the keys that were written with impossible signatures.
--
-- A minor key takes its own key signature, not its relative major's. The old
-- spelling logic picked sharps or flats from the major scale it had fitted (or
-- worse, from the accidental Klangio happened to emit), so a relative minor
-- inherited the wrong set: "Gb minor" asks for nine flats and "Db minor" for
-- eight. Neither appears in any real score; the names musicians use are F#
-- minor and C# minor, and the app had already produced one correct "F# minor"
-- elsewhere, so it was contradicting itself.
--
-- Same pitch, correct name — nothing about the detected music changes here.
-- Ab minor (7 flats) is left alone: it is unusual but real, and which of
-- Ab/G# minor to prefer is a judgement call rather than a mistake.

UPDATE public.song_analysis SET key = 'F# minor' WHERE key = 'Gb minor';
UPDATE public.song_analysis SET key = 'C# minor' WHERE key = 'Db minor';

UPDATE public.public_songs SET song_key = 'F# minor' WHERE song_key = 'Gb minor';
UPDATE public.public_songs SET song_key = 'C# minor' WHERE song_key = 'Db minor';
