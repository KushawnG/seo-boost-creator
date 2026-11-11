// Checks a reported key against the chords that were actually detected.
//
// The key comes straight from Klangio and nothing ever verified it against
// Klangio's own chord output. "Adorn" was labelled E minor while every chord
// in it — Em, F#m, G, A major, Bm, D — belongs to the D major scale; E minor
// would need A MINOR and F# DIMINISHED, neither of which appears anywhere in
// the song. The tonic was right, the mode was not.
//
// The approach is deliberately simple and explainable: find which major scale
// the chords actually sit in (weighted by how long each is played), then find
// which chord the music rests on, and name the mode from the distance between
// the two. That handles relative major/minor and modal songs, which a
// "major or minor only" guess cannot.

export type ChordSpan = [number, number, string];

const PITCH_CLASS: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10,
  Bb: 10, B: 11, Cb: 11,
};

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Triads of a major scale, in order, as semitone offset + quality.
const SCALE: ReadonlyArray<readonly [number, string]> = [
  [0, "maj"], [2, "min"], [4, "min"], [5, "maj"], [7, "maj"], [9, "min"], [11, "dim"],
];

// Degree 0 is the major scale itself; 5 is its relative minor.
const MODES = ["major", "dorian", "phrygian", "lydian", "mixolydian", "minor", "locrian"];

function isNoChord(chord: string): boolean {
  return chord === "N" || chord === "X" || !chord;
}

/** maj7/7/min7/… reduced to the triad quality that decides diatonic fit. */
function triadQuality(suffix: string | undefined): string {
  if (!suffix) return "maj";
  if (suffix.startsWith("min")) return "min";
  if (suffix.startsWith("dim")) return "dim";
  return "maj";
}

// Below this, no scale explains the chords well enough to argue about the
// key: the detection itself is too mixed, and claiming a conflict would just
// be noise dressed up as a finding.
const MIN_FIT_TO_JUDGE = 0.75;

export type KeySeverity =
  /** Chords belong to a different scale than the reported key. Worth a listen. */
  | "conflict"
  /** No scale fits well enough to judge — usually messy chord detection. */
  | "inconclusive"
  /** Same seven notes; we simply read a different chord as home. Low signal. */
  | "tonic-reading"
  /** Same tonic, a more precise mode name (minor -> dorian, major -> mixolydian). */
  | "refinement"
  /** Reported key and chords agree. */
  | "agrees";

export interface KeyVerdict {
  /** Best reading of the key, e.g. "D major", "B minor", "E dorian". */
  key: string;
  /** Share of playing time whose chords belong to that scale, 0-1. */
  fit: number;
  /** Share of playing time spent on the tonic chord, 0-1. */
  tonicWeight: number;
  /** Chords that fall outside the scale, longest first — the borrowed ones. */
  outside: string[];
  /** True when the reported key names the same tonic AND the same mode family. */
  agrees: boolean;
  /** How much the disagreement is worth acting on. */
  severity: KeySeverity;
  /** True when the reported key uses the same seven notes as our reading. */
  sameScale: boolean;
  /** Why, in a sentence a person can check by ear. */
  reason: string;
}

/**
 * Work out what key the chords are actually in, and whether `reportedKey`
 * agrees. Returns null when there isn't enough to judge.
 */
export function checkKey(
  timeline: ChordSpan[] | null | undefined,
  reportedKey: string | null | undefined,
): KeyVerdict | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;

  // Weight every chord by how long it is actually played. A chord held for
  // sixteen bars should count for more than a passing one, which is what
  // makes this robust to the detector's occasional one-beat flickers.
  const weight = new Map<string, number>();
  let total = 0;
  for (const [start, end, chord] of timeline) {
    if (isNoChord(chord)) continue;
    const seconds = Math.max(0, (end ?? 0) - (start ?? 0));
    if (!seconds) continue;
    const [root, suffix] = chord.split(":");
    const pc = PITCH_CLASS[root];
    if (pc === undefined) continue;
    const label = `${pc}:${triadQuality(suffix)}`;
    weight.set(label, (weight.get(label) ?? 0) + seconds);
    total += seconds;
  }
  if (total <= 0 || weight.size === 0) return null;

  // 1. Which major scale do these chords sit in? Diminished triads are left
  //    out of the scoring — detectors rarely emit them and their absence
  //    shouldn't argue against an otherwise perfect fit.
  let bestRoot = 0;
  let bestFit = -1;
  for (let root = 0; root < 12; root++) {
    const members = new Set(SCALE.map(([step, q]) => `${(root + step) % 12}:${q}`));
    let inside = 0;
    for (const [label, seconds] of weight) if (members.has(label)) inside += seconds;
    const fit = inside / total;
    if (fit > bestFit + 1e-9) { bestFit = fit; bestRoot = root; }
  }

  // 2. What does the music rest on? Mostly the chord played longest, with a
  //    nudge for the one it opens and closes on — a song usually comes home
  //    at the end even when another chord fills more time.
  const first = timeline.find((s) => !isNoChord(s[2]));
  const last = [...timeline].reverse().find((s) => !isNoChord(s[2]));
  const bonusFor = (span: ChordSpan | undefined) => {
    if (!span) return null;
    const [root, suffix] = span[2].split(":");
    const pc = PITCH_CLASS[root];
    return pc === undefined ? null : `${pc}:${triadQuality(suffix)}`;
  };
  const edges = [bonusFor(first), bonusFor(last)].filter(Boolean) as string[];

  let centre = "";
  let bestScore = -1;
  for (const [label, seconds] of weight) {
    if (label.endsWith(":dim")) continue;         // never a tonic in practice
    const score = seconds * (edges.includes(label) ? 1.25 : 1);
    if (score > bestScore) { bestScore = score; centre = label; }
  }
  if (!centre) return null;

  const centrePc = Number(centre.split(":")[0]);
  const degree = ((centrePc - bestRoot) % 12 + 12) % 12;
  const degreeIndex = SCALE.findIndex(([step]) => step === degree);
  // A centre outside the winning scale means the chords and the resting point
  // disagree; fall back to naming it by its own quality rather than inventing
  // a mode that isn't there.
  const mode = degreeIndex >= 0
    ? MODES[degreeIndex]
    : (centre.endsWith(":min") ? "minor" : "major");

  const key = `${NAMES[centrePc]} ${mode}`;
  const outside = [...weight.entries()]
    .filter(([label]) => {
      const members = new Set(SCALE.map(([step, q]) => `${(bestRoot + step) % 12}:${q}`));
      return !members.has(label);
    })
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => {
      const [pc, q] = label.split(":");
      return `${NAMES[Number(pc)]}${q === "min" ? "m" : q === "dim" ? "dim" : ""}`;
    });

  // Agreement is about the tonic and the broad family, not the exact word:
  // calling E dorian "E minor" is imprecise but not wrong in the way that
  // calling it B minor would be.
  const reported = (reportedKey ?? "").trim().match(/^([A-G][b#]?)\s+(major|minor)$/i);
  const reportedPc = reported ? PITCH_CLASS[reported[1]] : undefined;
  const reportedMinor = reported ? reported[2].toLowerCase() === "minor" : false;
  const centreIsMinorish = ["minor", "dorian", "phrygian", "locrian"].includes(mode);
  const agrees =
    reportedPc !== undefined &&
    reportedPc === centrePc &&
    reportedMinor === centreIsMinorish;

  // Does the reported key use the SAME seven notes we landed on? Most
  // apparent disagreements are this: C major and F lydian are the same scale
  // read from different degrees, so the only argument is over which chord is
  // home — and picking the home chord by playing time is a weak heuristic,
  // because in plenty of pop songs the V is held longer than the I. Those are
  // reported as low-signal rather than as errors.
  let sameScale = false;
  if (reportedPc !== undefined) {
    const reportedScaleRoot = reportedMinor ? (reportedPc + 3) % 12 : reportedPc;
    sameScale = reportedScaleRoot === bestRoot;
  }

  const severity: KeySeverity = agrees
    ? (key.toLowerCase() === (reportedKey ?? "").trim().toLowerCase() ? "agrees" : "refinement")
    : bestFit < MIN_FIT_TO_JUDGE
      ? "inconclusive"
      : sameScale
        ? "tonic-reading"
        : "conflict";

  const tonicWeight = (weight.get(centre) ?? 0) / total;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reason =
    `${pct(bestFit)} of the playing time fits the ${NAMES[bestRoot]} major scale, ` +
    `and the music rests on ${NAMES[centrePc]}${centre.endsWith(":min") ? "m" : ""} ` +
    `(${pct(tonicWeight)} of the time)` +
    (outside.length ? `, with ${outside.slice(0, 3).join(", ")} borrowed from outside it.` : ".");

  return { key, fit: bestFit, tonicWeight, outside, agrees, severity, sameScale, reason };
}
