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

/** Turn Klangio chord names ("A:min", "F#:maj") into display names ("Am", "F#"). */
export function formatChordName(chord: string): string {
  if (chord === 'N' || chord === 'X') return 'N.C.';
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
