// Checks a reported key against the chords that were actually detected.
//
// The key comes straight from Klangio and nothing verified it against
// Klangio's own chord output. "Adorn" was labelled E minor while every chord
// in it — Em, F#m, G, A major, Bm, D — belongs to the D major / B minor
// scale. E minor would need an A MINOR and an F# DIMINISHED and the song has
// neither; the real key is B minor, where that dominant Em is simply the iv.
//
// Deliberately only ever answers "X major" or "X minor". Modal names are more
// precise and less useful: someone learning a song wants the key signature and
// the chord shapes, not to be told their song is mixolydian.
//
// Two steps. Which seven notes are being played — reliable, since it is just
// time-weighted counting — then which of that scale's two keys the music sits
// in, major or its relative minor. The second step is the hard one, and the
// thresholds at the bottom exist to stop it guessing.

export type ChordSpan = [number, number, string];

const PITCH_CLASS: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10,
  Bb: 10, B: 11, Cb: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
// Major scales conventionally written with sharps: C G D A E B.
const SHARP_SIGNATURES = new Set([0, 7, 2, 9, 4, 11]);

/** Triads of a major scale: semitone offset from the tonic, and quality. */
const SCALE: ReadonlyArray<readonly [number, string]> = [
  [0, "maj"], [2, "min"], [4, "min"], [5, "maj"], [7, "maj"], [9, "min"], [11, "dim"],
];

// Below this, no scale explains the chords well enough to argue about the key:
// the detection itself is mixed and a confident answer would be noise.
const MIN_FIT_TO_JUDGE = 0.75;
// The new reading must explain the chords well...
const APPLY_MIN_FIT = 0.85;
// ...and beat the reported key by a clear margin, not a rounding difference.
const APPLY_MIN_GAIN = 0.10;
// ...and the key we name must actually be played. Without this, a song living
// on one chord gets assigned a tonic that never sounds in it.
const MIN_TONIC_WEIGHT = 0.08;

// A separate route, for the one error a scale test cannot see. A major key and
// its relative minor share all seven notes, so picking the wrong one of the
// two fits the chords perfectly and scores no improvement at all. The only
// evidence is which of the two tonic chords is actually played: "white keys"
// was filed as D major while D sounds for 5% of the song and Bm for 28%.
// Demanding double the weight, and a decent share outright, keeps this away
// from songs where the two are genuinely close.
const RELATIVE_SWAP_RATIO = 2;
const RELATIVE_SWAP_MIN = 0.15;

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

function label(chord: string): string | null {
  const [root, suffix] = chord.split(":");
  const pc = PITCH_CLASS[root];
  return pc === undefined ? null : `${pc}:${triadQuality(suffix)}`;
}

export type KeySeverity =
  /** The reported key does not explain the chords; ours does. */
  | "conflict"
  /** No scale fits well enough to judge — usually messy chord detection. */
  | "inconclusive"
  /** Reported key and chords agree. */
  | "agrees";

export interface KeyVerdict {
  /** Best reading, always "X major" or "X minor". */
  key: string;
  /** Share of playing time whose chords belong to that scale, 0-1. */
  fit: number;
  /** Same measure for the scale the REPORTED key implies, or null. */
  reportedFit: number | null;
  /** Share of playing time spent on the tonic chord itself, 0-1. */
  tonicWeight: number;
  /** Share spent on the chord the REPORTED key calls home, 0-1. */
  reportedTonicWeight: number;
  /** Chords outside the scale, longest first — the borrowed ones. */
  outside: string[];
  agrees: boolean;
  severity: KeySeverity;
  /** Why, in a sentence someone can check by ear. */
  reason: string;
}

function scaleMembers(root: number): Set<string> {
  return new Set(SCALE.map(([step, q]) => `${(root + step) % 12}:${q}`));
}

/** How much of the playing time a given major scale accounts for. */
function fitOf(root: number, weight: Map<string, number>, total: number): number {
  const members = scaleMembers(root);
  let inside = 0;
  for (const [l, seconds] of weight) if (members.has(l)) inside += seconds;
  return total > 0 ? inside / total : 0;
}

export function checkKey(
  timeline: ChordSpan[] | null | undefined,
  reportedKey: string | null | undefined,
): KeyVerdict | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;

  // Weight every chord by how long it is actually played, so a chord held for
  // sixteen bars counts for more than one of the detector's passing flickers.
  const weight = new Map<string, number>();
  let total = 0;
  for (const [start, end, chord] of timeline) {
    if (isNoChord(chord)) continue;
    const seconds = Math.max(0, (end ?? 0) - (start ?? 0));
    const l = seconds ? label(chord) : null;
    if (!l) continue;
    weight.set(l, (weight.get(l) ?? 0) + seconds);
    total += seconds;
  }
  if (total <= 0 || weight.size === 0) return null;

  // 1. Which seven notes is this song using?
  let scaleRoot = 0;
  let fit = -1;
  for (let root = 0; root < 12; root++) {
    const f = fitOf(root, weight, total);
    if (f > fit + 1e-9) { fit = f; scaleRoot = root; }
  }

  // 2. Major, or its relative minor? Those are the only two candidates, which
  //    is what keeps this honest — there is no third option to drift into.
  const majorPc = scaleRoot;
  const minorPc = (scaleRoot + 9) % 12;
  const majorWeight = weight.get(`${majorPc}:maj`) ?? 0;
  const minorWeight = weight.get(`${minorPc}:min`) ?? 0;

  const firstSpan = timeline.find((s) => !isNoChord(s[2]));
  const lastSpan = [...timeline].reverse().find((s) => !isNoChord(s[2]));
  const firstLabel = firstSpan ? label(firstSpan[2]) : null;
  const lastLabel = lastSpan ? label(lastSpan[2]) : null;

  // A song resolves home at the end far more reliably than it spends the most
  // time there, so the final chord counts for more than the opening one.
  const endsOn = (l: string) => (lastLabel === l ? 0.30 : 0);
  const startsOn = (l: string) => (firstLabel === l ? 0.10 : 0);

  // A MAJOR chord on the scale's third degree is the V of the relative minor
  // with its raised seventh — the clearest harmonic sign of a minor key, and
  // one that cannot occur naturally in the major one.
  const minorDominant = weight.get(`${(scaleRoot + 4) % 12}:maj`) ?? 0;

  const majorScore = majorWeight / total + endsOn(`${majorPc}:maj`) + startsOn(`${majorPc}:maj`);
  const minorScore = minorWeight / total + endsOn(`${minorPc}:min`) + startsOn(`${minorPc}:min`)
    + (minorDominant / total) * 0.5;

  const isMinor = minorScore > majorScore;
  const tonicPc = isMinor ? minorPc : majorPc;
  const tonicWeight = (isMinor ? minorWeight : majorWeight) / total;

  const reported = (reportedKey ?? "").trim().match(/^([A-G][b#]?)\s+(major|minor)$/i);
  const reportedPc = reported ? PITCH_CLASS[reported[1]] : undefined;
  const reportedMinor = reported ? reported[2].toLowerCase() === "minor" : false;

  const explicit = (reportedKey ?? "").match(/^([A-G][b#]?)/)?.[1] ?? "";
  const NAMES = explicit.includes("b") ? FLAT_NAMES
    : explicit.includes("#") ? SHARP_NAMES
    : SHARP_SIGNATURES.has(scaleRoot) ? SHARP_NAMES : FLAT_NAMES;

  const key = `${NAMES[tonicPc]} ${isMinor ? "minor" : "major"}`;

  const members = scaleMembers(scaleRoot);
  const outside = [...weight.entries()]
    .filter(([l]) => !members.has(l))
    .sort((a, b) => b[1] - a[1])
    .map(([l]) => {
      const [pc, q] = l.split(":");
      return `${NAMES[Number(pc)]}${q === "min" ? "m" : q === "dim" ? "dim" : ""}`;
    });

  const reportedFit = reportedPc === undefined
    ? null
    : fitOf(reportedMinor ? (reportedPc + 3) % 12 : reportedPc, weight, total);

  // How much is the chord the reported key calls home actually played? This
  // is what separates two cases that are otherwise identical to the maths.
  // "Adorn" is reported E minor and we read B minor; "Hard Place" is reported
  // E major and we read A major. Both reported keys fit their own scale
  // poorly, both of ours fit near-perfectly — yet Adorn's answer is ours and
  // Hard Place's is the detector's. The difference is that Hard Place really
  // does live on its E, so a key that doesn't name E cannot be right. When
  // the reported tonic outweighs ours, the detector keeps the benefit of the
  // doubt.
  const reportedTonicWeight = reportedPc === undefined
    ? 0
    : (weight.get(`${reportedPc}:${reportedMinor ? "min" : "maj"}`) ?? 0) / total;

  const agrees =
    reportedPc !== undefined && reportedPc === tonicPc && reportedMinor === isMinor;

  const severity: KeySeverity = agrees
    ? "agrees"
    : fit < MIN_FIT_TO_JUDGE ? "inconclusive" : "conflict";

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reason =
    `${pct(fit)} of the playing time fits the ${NAMES[scaleRoot]} major scale` +
    (reportedFit !== null ? ` (the reported key explains ${pct(reportedFit)})` : "") +
    `, and between ${NAMES[majorPc]} major and ${NAMES[minorPc]} minor the music sits on ` +
    `${NAMES[tonicPc]} ${isMinor ? "minor" : "major"}` +
    (outside.length ? `, with ${outside.slice(0, 3).join(", ")} borrowed.` : ".");

  return { key, fit, reportedFit, tonicWeight, reportedTonicWeight, outside, agrees, severity, reason };
}

export interface KeyCorrection {
  key: string;
  changed: boolean;
  verdict: KeyVerdict | null;
}

/**
 * The single definition of "what key should we store", shared by the analysis
 * pipeline and the backfill so the two can never disagree.
 *
 * Overrules the detector only when the chords clearly say otherwise AND the
 * key we would name is actually played. A song that sits on a chord which is
 * neither the major nor the relative minor tonic is left alone: forcing a
 * major/minor answer onto it does more harm than the detector's own guess.
 */
export function correctedKey(
  timeline: ChordSpan[] | null | undefined,
  reportedKey: string | null | undefined,
): KeyCorrection {
  const verdict = checkKey(timeline, reportedKey);
  const fallback = (reportedKey ?? "").trim();
  if (!verdict || !reportedKey) return { key: fallback, changed: false, verdict };

  const gain = verdict.reportedFit === null ? 0 : verdict.fit - verdict.reportedFit;

  // Route one: the reported key's own scale fails to explain the chords and
  // ours does. The chord we want to call home must still be played more than
  // the one the detector called home — without that, a song sitting on a
  // chord outside both our candidates gets dragged onto whichever scores
  // higher, which is how "Hard Place" became A major when it is clearly E.
  const scaleIsWrong =
    verdict.fit >= APPLY_MIN_FIT &&
    gain >= APPLY_MIN_GAIN &&
    verdict.tonicWeight >= MIN_TONIC_WEIGHT &&
    verdict.tonicWeight > verdict.reportedTonicWeight;

  // Route two: the same seven notes, but the wrong one of the two keys that
  // share them. No scale improvement is possible here, so the tonic weights
  // have to carry the whole argument.
  const relativeSwap =
    verdict.fit >= APPLY_MIN_FIT &&
    verdict.tonicWeight >= RELATIVE_SWAP_MIN &&
    verdict.tonicWeight >= verdict.reportedTonicWeight * RELATIVE_SWAP_RATIO;

  const worthApplying = verdict.severity === "conflict" && (scaleIsWrong || relativeSwap);

  return worthApplying
    ? { key: verdict.key, changed: verdict.key !== fallback, verdict }
    : { key: fallback, changed: false, verdict };
}
