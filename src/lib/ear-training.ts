// Music-theory helpers for Ear Training Mode: enharmonic-aware key/chord
// comparison, "main chords" extraction, and diatonic chord listing.
import type { ChordSpan } from "@/lib/chords";

// Pitch classes (C = 0) with enharmonic spellings
const NOTE_PC: Record<string, number> = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4,
  "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10,
  Bb: 10, B: 11, Cb: 11,
};

export type KeyMode = "major" | "minor";
export type ChordQuality = "maj" | "min";

export interface ParsedKey { pc: number; mode: KeyMode }
export interface ParsedChord { pc: number; quality: string; label: string }

/** Parse a Klangio key string like "Db major" / "E minor". */
export function parseKey(key: string | null | undefined): ParsedKey | null {
  const m = (key ?? "").trim().match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!m) return null;
  const pc = NOTE_PC[m[1]];
  if (pc === undefined) return null;
  return { pc, mode: m[2].toLowerCase() as KeyMode };
}

/** Parse a timeline chord like "F#:min" / "A:maj". Returns null for "N"/unknown. */
export function parseChord(chord: string | null | undefined): ParsedChord | null {
  const m = (chord ?? "").trim().match(/^([A-G][b#]?):(\w+)$/);
  if (!m) return null;
  const pc = NOTE_PC[m[1]];
  if (pc === undefined) return null;
  const quality = m[2];
  const label = m[1] + (quality === "maj" ? "" : quality === "min" ? "m" : quality);
  return { pc, quality, label };
}

/** The song's main chords (top n by total played duration), in timeline order of first appearance. */
export function mainChords(timeline: ChordSpan[], n = 4): string[] {
  const durations = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  for (const [start, end, chord] of timeline) {
    if (!chord || chord === "N") continue;
    durations.set(chord, (durations.get(chord) ?? 0) + Math.max(end - start, 0));
    if (!firstSeen.has(chord)) firstSeen.set(chord, start);
  }
  return [...durations.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([chord]) => chord)
    .sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
}

/** First real (non-"N") chord in the song. */
export function firstChord(timeline: ChordSpan[]): string | null {
  for (const [, , chord] of timeline) {
    if (chord && chord !== "N") return chord;
  }
  return null;
}

// The 24 keys a user can guess, enharmonic pairs labeled together.
const ROOT_LABELS = [
  "C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B",
];
export const KEY_GUESS_OPTIONS: { value: string; label: string }[] = [
  ...ROOT_LABELS.map((l, pc) => ({ value: `${pc}-major`, label: `${l} major` })),
  ...ROOT_LABELS.map((l, pc) => ({ value: `${pc}-minor`, label: `${l} minor` })),
];
export const ROOT_GUESS_OPTIONS: { value: string; label: string }[] = ROOT_LABELS.map(
  (l, pc) => ({ value: String(pc), label: l }),
);

/** Does a key guess (option value like "1-major") match the analysis key? */
export function keyGuessCorrect(guessValue: string, analysisKey: string | null | undefined): boolean {
  const parsed = parseKey(analysisKey);
  if (!parsed) return false;
  const [pcStr, mode] = guessValue.split("-");
  return Number(pcStr) === parsed.pc && mode === parsed.mode;
}

/** Does a chord guess (root pc + maj/min) match one of the song's chords? */
export function chordGuessMatch(
  guessPc: number,
  guessQuality: ChordQuality,
  songChord: string,
): boolean {
  const parsed = parseChord(songChord);
  return !!parsed && parsed.pc === guessPc && parsed.quality === guessQuality;
}

/** Display label for a guess. */
export function guessLabel(pc: number, quality: ChordQuality): string {
  return ROOT_LABELS[pc] + (quality === "min" ? "m" : "");
}

// Diatonic chords, spelled correctly (consecutive letters) from the named key.
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function spellNote(letter: string, targetPc: number): string {
  let diff = (targetPc - NATURAL_PC[letter] + 12) % 12;
  if (diff > 6) diff -= 12;
  const accidental =
    diff === 0 ? "" : diff === 1 ? "#" : diff === 2 ? "##" : diff === -1 ? "b" : "bb";
  return letter + accidental;
}

/** The 7 diatonic triads of a named key, e.g. "C major" -> C, Dm, Em, F, G, Am, B°. */
export function diatonicChords(key: string | null | undefined): string[] | null {
  const m = (key ?? "").trim().match(/^([A-G][b#]?)\s+(major|minor)$/i);
  if (!m) return null;
  const rootName = m[1];
  const rootPc = NOTE_PC[rootName];
  if (rootPc === undefined) return null;
  const mode = m[2].toLowerCase() as KeyMode;
  const rootLetterIdx = LETTERS.indexOf(rootName[0]);
  const steps = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const qualities = mode === "major"
    ? ["", "m", "m", "", "", "m", "°"]
    : ["m", "°", "", "m", "m", "", ""];
  return steps.map((step, i) => {
    const letter = LETTERS[(rootLetterIdx + i) % 7];
    return spellNote(letter, (rootPc + step) % 12) + qualities[i];
  });
}
