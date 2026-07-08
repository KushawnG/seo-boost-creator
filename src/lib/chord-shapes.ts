// Deterministic chord voicings for the 24 chords in Klangio's major-minor
// vocabulary. These are standard, hand-verified shapes — not generated.

export type Instrument = 'off' | 'guitar' | 'piano';

// ---------- Guitar ----------
// frets: low E → high E; -1 = muted, 0 = open, n = fret number (absolute).
// barre: [fret, fromString, toString] (0 = low E) for rendering the barre bar.
export interface GuitarShape {
  frets: [number, number, number, number, number, number];
  barre?: [number, number, number];
}

export const GUITAR_SHAPES: Record<string, GuitarShape> = {
  // Majors
  'C:maj':  { frets: [-1, 3, 2, 0, 1, 0] },
  'C#:maj': { frets: [-1, 4, 6, 6, 6, 4], barre: [4, 1, 5] },
  'D:maj':  { frets: [-1, -1, 0, 2, 3, 2] },
  'D#:maj': { frets: [-1, 6, 8, 8, 8, 6], barre: [6, 1, 5] },
  'E:maj':  { frets: [0, 2, 2, 1, 0, 0] },
  'F:maj':  { frets: [1, 3, 3, 2, 1, 1], barre: [1, 0, 5] },
  'F#:maj': { frets: [2, 4, 4, 3, 2, 2], barre: [2, 0, 5] },
  'G:maj':  { frets: [3, 2, 0, 0, 0, 3] },
  'G#:maj': { frets: [4, 6, 6, 5, 4, 4], barre: [4, 0, 5] },
  'A:maj':  { frets: [-1, 0, 2, 2, 2, 0] },
  'A#:maj': { frets: [-1, 1, 3, 3, 3, 1], barre: [1, 1, 5] },
  'B:maj':  { frets: [-1, 2, 4, 4, 4, 2], barre: [2, 1, 5] },
  // Minors
  'C:min':  { frets: [-1, 3, 5, 5, 4, 3], barre: [3, 1, 5] },
  'C#:min': { frets: [-1, 4, 6, 6, 5, 4], barre: [4, 1, 5] },
  'D:min':  { frets: [-1, -1, 0, 2, 3, 1] },
  'D#:min': { frets: [-1, 6, 8, 8, 7, 6], barre: [6, 1, 5] },
  'E:min':  { frets: [0, 2, 2, 0, 0, 0] },
  'F:min':  { frets: [1, 3, 3, 1, 1, 1], barre: [1, 0, 5] },
  'F#:min': { frets: [2, 4, 4, 2, 2, 2], barre: [2, 0, 5] },
  'G:min':  { frets: [3, 5, 5, 3, 3, 3], barre: [3, 0, 5] },
  'G#:min': { frets: [4, 6, 6, 4, 4, 4], barre: [4, 0, 5] },
  'A:min':  { frets: [-1, 0, 2, 2, 1, 0] },
  'A#:min': { frets: [-1, 1, 3, 3, 2, 1], barre: [1, 1, 5] },
  'B:min':  { frets: [-1, 2, 4, 4, 3, 2], barre: [2, 1, 5] },
};

// ---------- Piano ----------
const NOTE_INDEX: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

const MAJOR_INTERVALS = [0, 4, 7];
const MINOR_INTERVALS = [0, 3, 7];

/**
 * Semitone offsets (0 = C at the left edge of the diagram) of the keys to
 * press for a chord, in root position. Spans up to two octaves (0-23).
 */
export function pianoKeysFor(chord: string): number[] | null {
  const [root, quality] = chord.split(':');
  const rootIndex = NOTE_INDEX[root];
  if (rootIndex === undefined) return null;
  const intervals = quality === 'min' ? MINOR_INTERVALS : MAJOR_INTERVALS;
  return intervals.map((interval) => rootIndex + interval);
}

/** Whether we can draw diagrams for this chord (excludes N.C. and exotic names). */
export function hasDiagram(chord: string): boolean {
  return chord in GUITAR_SHAPES;
}
