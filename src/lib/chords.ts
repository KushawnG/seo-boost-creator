export type ChordSpan = [number, number, string]; // [startSec, endSec, chordName]
export type Beat = [number, number]; // [timestampSec, beatPositionInBar]

const SUFFIX_LABELS: Record<string, string> = {
  maj: '',
  min: 'm',
  maj7: 'maj7',
  min7: 'm7',
  '7': '7',
  dim: 'dim',
  aug: 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  maj6: '6',
  min6: 'm6',
};

/** "No chord" — standard notation for passages where no chord sounds. */
export const NO_CHORD_SYMBOL = 'N.C.';

// ---- transposition ----
const NOTE_PC: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4,
  'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10,
  Bb: 10, B: 11, Cb: 11,
};
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function shiftRoot(root: string, semitones: number): string | null {
  const pc = NOTE_PC[root];
  if (pc === undefined) return null;
  const names = root.includes('b') ? FLAT_NAMES : SHARP_NAMES;
  return names[(((pc + semitones) % 12) + 12) % 12];
}

/** Transpose a Klangio chord name ("A:maj") by n semitones; "N"/"X" pass through. */
export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0 || isNoChord(chord)) return chord;
  const [root, suffix] = chord.split(':');
  const shifted = shiftRoot(root, semitones);
  if (!shifted) return chord;
  return suffix ? `${shifted}:${suffix}` : shifted;
}

/** Transpose a key name ("A major") by n semitones. */
export function transposeKey(key: string, semitones: number): string {
  if (semitones === 0) return key;
  const m = key.trim().match(/^([A-G][b#]?)(\s+.*)$/);
  if (!m) return key;
  const shifted = shiftRoot(m[1], semitones);
  return shifted ? shifted + m[2] : key;
}

/** Turn Klangio chord names ("A:min", "F#:maj") into display names ("Am", "F#"). */
export function formatChordName(chord: string): string {
  if (chord === 'N' || chord === 'X') return NO_CHORD_SYMBOL;
  const [root, suffix] = chord.split(':');
  if (!suffix) return root;
  return root + (SUFFIX_LABELS[suffix] ?? suffix);
}

export function isNoChord(chord: string): boolean {
  return chord === 'N' || chord === 'X';
}

/** Index of the chord span containing `time`, or -1. */
export function chordIndexAt(timeline: ChordSpan[], time: number): number {
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = timeline[mid];
    if (time < start) hi = mid - 1;
    else if (time >= end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Index of the last beat at or before `time`, or -1. */
export function beatIndexAt(beats: Beat[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid][0] <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
