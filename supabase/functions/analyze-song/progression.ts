// MIRROR of src/lib/progression.ts — same algorithm, standalone for Deno so the
// analysis pipeline and the app agree on what the chords actually are.
// Keep the two in sync; the app-side file is the reference copy.

export type ChordSpan = [number, number, string];
export type Beat = [number, number];

export function isNoChord(chord: string): boolean {
  return chord === "N" || chord === "X";
}


const DEFAULT_BPM = 100;

/** Beats per bar from a time signature like "4/4" (defaults to 4). */
export function beatsPerBar(timeSignature: string | null | undefined): number {
  const n = parseInt((timeSignature ?? "").split("/")[0], 10);
  return Number.isFinite(n) && n >= 2 && n <= 12 ? n : 4;
}

function synthesize(step: number, endTime: number): number[] {
  const out: number[] = [];
  if (!(step > 0.05)) return out;
  for (let t = 0; t <= endTime + step; t += step) out.push(Number(t.toFixed(3)));
  return out;
}

const MAX_SLOTS = 8000;

/**
 * Klangio's beat list often stops short of the song (no beats detected under a
 * sparse intro or a fading outro). Extend the grid at its own spacing so every
 * chord still lands in a slot — otherwise cleaning would silently drop the
 * first or last minute of the timeline.
 */
function padGrid(grid: number[], start: number, end: number): number[] {
  if (grid.length < 2) return grid;
  const gaps: number[] = [];
  for (let i = 1; i < grid.length; i++) gaps.push(grid[i] - grid[i - 1]);
  gaps.sort((a, b) => a - b);
  const step = gaps[Math.floor(gaps.length / 2)];
  if (!(step > 0.05)) return grid;

  const head: number[] = [];
  for (let t = grid[0] - step; t > start + 1e-6 && head.length < MAX_SLOTS; t -= step) {
    head.push(Number(t.toFixed(3)));
  }
  const out = [...head.reverse(), ...grid];
  if (out[0] > start) out.unshift(start);
  for (
    let t = out[out.length - 1] + step;
    t < end - 1e-6 && out.length < MAX_SLOTS;
    t += step
  ) {
    out.push(Number(t.toFixed(3)));
  }
  if (out[out.length - 1] < end) out.push(end);
  return out;
}

/** Beat grid: real beat times when Klangio gave us them, else derived from BPM. */
export function beatGrid(
  beats: Beat[] | null | undefined,
  bpm: number | null | undefined,
  startTime: number,
  endTime: number,
): number[] {
  const times = (beats ?? []).map((b) => b[0]).filter((t) => Number.isFinite(t));
  if (times.length >= 4) return padGrid(times, startTime, endTime);
  return synthesize(60 / (bpm || DEFAULT_BPM), endTime);
}

/** Bar grid: downbeats (beat 1) when available, else every N beats. */
export function barGrid(
  beats: Beat[] | null | undefined,
  bpm: number | null | undefined,
  timeSignature: string | null | undefined,
  startTime: number,
  endTime: number,
): number[] {
  const per = beatsPerBar(timeSignature);
  const downbeats = (beats ?? []).filter((b) => b[1] === 1).map((b) => b[0]);
  if (downbeats.length >= 4) return padGrid(downbeats, startTime, endTime);
  const grid = beatGrid(beats, bpm, startTime, endTime);
  if (grid.length >= 4) return grid.filter((_, i) => i % per === 0);
  return synthesize((per * 60) / (bpm || DEFAULT_BPM), endTime);
}

/**
 * The chord occupying each slot of a grid — whichever one sounds longest inside
 * it. Sub-slot flickers lose by construction.
 */
export function quantize(timeline: ChordSpan[], grid: number[]): string[] {
  const slots: string[] = [];
  let cursor = 0;
  for (let i = 0; i < grid.length - 1; i++) {
    const from = grid[i];
    const to = grid[i + 1];
    const totals = new Map<string, number>();
    while (cursor > 0 && timeline[cursor - 1] && timeline[cursor - 1][1] > from) cursor--;
    for (let j = cursor; j < timeline.length; j++) {
      const [start, end, chord] = timeline[j];
      if (end <= from) {
        if (j === cursor) cursor = j + 1;
        continue;
      }
      if (start >= to) break;
      const overlap = Math.min(end, to) - Math.max(start, from);
      if (overlap > 0) totals.set(chord, (totals.get(chord) ?? 0) + overlap);
    }
    let best = "N";
    let bestDur = 0;
    for (const [chord, dur] of totals) {
      if (dur > bestDur) {
        best = chord;
        bestDur = dur;
      }
    }
    slots.push(best);
  }
  return slots;
}

/** Grid slots collapsed back into spans, adjacent repeats merged. */
function slotsToSpans(slots: string[], grid: number[]): ChordSpan[] {
  const out: ChordSpan[] = [];
  for (let i = 0; i < slots.length; i++) {
    const prev = out[out.length - 1];
    if (prev && prev[2] === slots[i]) prev[1] = grid[i + 1];
    else out.push([grid[i], grid[i + 1], slots[i]]);
  }
  return out;
}

function mergeAdjacent(spans: ChordSpan[]): ChordSpan[] {
  const out: ChordSpan[] = [];
  for (const [start, end, chord] of spans) {
    const prev = out[out.length - 1];
    if (prev && prev[2] === chord) prev[1] = end;
    else out.push([start, end, chord]);
  }
  return out;
}

// A chord that never once holds for a full bar and barely occupies the song is
// a detection artifact, not something anybody played.
const NOISE_SHARE = 0.02;

function dropArtifactChords(spans: ChordSpan[], barSeconds: number): ChordSpan[] {
  if (spans.length < 3) return spans;
  const total = spans.reduce((sum, [s, e]) => sum + (e - s), 0);
  const stats = new Map<string, { total: number; longest: number }>();
  for (const [start, end, chord] of spans) {
    const dur = end - start;
    const st = stats.get(chord) ?? { total: 0, longest: 0 };
    st.total += dur;
    st.longest = Math.max(st.longest, dur);
    stats.set(chord, st);
  }
  const isArtifact = (chord: string) => {
    if (isNoChord(chord)) return false;
    const st = stats.get(chord);
    if (!st) return false;
    return st.longest < barSeconds * 0.95 && st.total < total * NOISE_SHARE;
  };
  if (![...stats.keys()].some(isArtifact)) return spans;

  // Hand each artifact's time to whichever neighbour it interrupted.
  const kept: ChordSpan[] = [];
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (!isArtifact(span[2])) {
      kept.push([span[0], span[1], span[2]]);
      continue;
    }
    const prev = kept[kept.length - 1];
    let next = null;
    for (let j = i + 1; j < spans.length; j++) {
      if (!isArtifact(spans[j][2])) {
        next = spans[j];
        break;
      }
    }
    if (prev && (!next || next[2] === prev[2] || prev[1] - prev[0] >= next[1] - next[0])) {
      prev[1] = span[1];
    } else if (next) {
      next[0] = span[0];
    } else if (prev) {
      prev[1] = span[1];
    }
  }
  return mergeAdjacent(kept);
}

/**
 * The timeline as a musician would write it: every chord snapped to the beat it
 * lands on, flickers dropped, repeats merged. Falls back to the raw timeline if
 * there's no usable grid.
 */
export function cleanTimeline(
  timeline: ChordSpan[],
  beats: Beat[] | null | undefined,
  bpm: number | null | undefined,
  timeSignature?: string | null,
): ChordSpan[] {
  if (timeline.length < 3) return timeline;
  const startTime = timeline[0][0];
  const endTime = timeline[timeline.length - 1][1];
  const grid = beatGrid(beats, bpm, startTime, endTime);
  if (grid.length < 4) return timeline;
  const barSeconds = (beatsPerBar(timeSignature) * 60) / (bpm || DEFAULT_BPM);
  const cleaned = dropArtifactChords(slotsToSpans(quantize(timeline, grid), grid), barSeconds);
  return cleaned.length ? cleaned : timeline;
}

/** Distinct chords in play order, "N" excluded. */
export function chordsInOrder(timeline: ChordSpan[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [, , chord] of timeline) {
    if (isNoChord(chord) || seen.has(chord)) continue;
    seen.add(chord);
    out.push(chord);
  }
  return out;
}

const MAX_LOOP_BARS = 8;
const MIN_COVERAGE = 0.25;

/** Slot boundaries taken every `step` beats, starting `offset` beats in. */
function steppedGrid(beatTimes: number[], step: number, offset: number): number[] {
  const out: number[] = [];
  for (let i = offset; i < beatTimes.length; i += step) out.push(beatTimes[i]);
  return out;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Express a loop at its own resolution. Found on a beat grid, a one-chord-per-bar
 * loop arrives as "E E E E Bm Bm Bm Bm …"; every run divides by four, so it is
 * really "E Bm A E". A genuine two-bar hold (runs of 2, 1, 1) has no common
 * divisor and is left alone.
 */
function normalizeRuns(window: string[]): string[] {
  const runs: { chord: string; count: number }[] = [];
  for (const chord of window) {
    const last = runs[runs.length - 1];
    if (last && last.chord === chord) last.count++;
    else runs.push({ chord, count: 1 });
  }
  let divisor = runs[0].count;
  for (const run of runs) divisor = gcd(divisor, run.count);
  if (divisor <= 1) return window;
  const out: string[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.count / divisor; i++) out.push(run.chord);
  }
  return out;
}

/** Best repeating window in a slot sequence, scored by how much of it they tile. */
function findLoop(slots: string[], maxLen: number): { window: string[]; coverage: number } | null {
  const n = slots.length;
  let best: string[] | null = null;
  let bestCoverage = 0;
  for (let L = 2; L <= Math.min(maxLen, Math.floor(n / 2)); L++) {
    for (let phase = 0; phase < L; phase++) {
      const counts = new Map<string, number>();
      for (let i = phase; i + L <= n; i += L) {
        const window = slots.slice(i, i + L);
        if (window.some((c) => isNoChord(c))) continue;
        const k = window.join("|");
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const [k, count] of counts) {
        if (count < 2) continue;
        const window = k.split("|");
        if (isRepeatedCycle(window) || isDominatedByOneChord(window)) continue;
        const coverage = (count * L) / n;
        if (coverage > bestCoverage) {
          bestCoverage = coverage;
          best = window;
        }
      }
    }
  }
  return best ? { window: best, coverage: bestCoverage } : null;
}

/** Is `window` just a shorter cycle written out several times? */
function isRepeatedCycle(window: string[]): boolean {
  const L = window.length;
  for (let p = 1; p < L; p++) {
    if (L % p !== 0) continue;
    let tiles = true;
    for (let i = p; i < L && tiles; i++) if (window[i] !== window[i - p]) tiles = false;
    if (tiles) return true;
  }
  return false;
}

const ROOT_OF = (chord: string) => chord.split(":")[0];

/**
 * Pick where the loop starts. Players count a progression from the tonic and
 * never from the middle of a held chord: a two-bar E at the seam reads as
 * "E Bm A E" (the E lands on the last bar and rings into the repeat), never
 * "E E Bm A".
 */
function bestRotation(window: string[], key: string | null | undefined): string[] {
  const tonic = (key ?? "").trim().split(/\s+/)[0];
  let best = window;
  let bestScore = -Infinity;
  for (let r = 0; r < window.length; r++) {
    const rot = [...window.slice(r), ...window.slice(0, r)];
    let score = 0;
    if (tonic && ROOT_OF(rot[0]) === tonic) score += 4;
    if (rot[0] !== rot[1]) score += 2; // doesn't start mid-held-chord
    score -= r * 0.01; // ties go to the earliest reading
    if (score > bestScore) {
      bestScore = score;
      best = rot;
    }
  }
  return best;
}

/** One chord hogging the loop isn't a progression, it's a vamp. */
function isDominatedByOneChord(window: string[]): boolean {
  const counts = new Map<string, number>();
  for (const c of window) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const n of counts.values()) if (n > window.length * 0.6) return true;
  return false;
}

/**
 * The repeating loop that carries the song, e.g. E - Bm - A - E.
 *
 * Counts in slots rather than chord changes, so a chord held for two bars counts
 * twice — that's the difference between "E Bm A E" (what players count) and
 * "E Bm A" (what a naive de-duplicated read produces).
 *
 * Harmonic rhythm varies, so there's no single right slot size: plenty of songs
 * change chord twice a bar, and plenty push the change off the downbeat. Every
 * sensible grid is tried — whole bar, half bar, single beat, at each offset
 * within the bar — and whichever tiles the most of the song wins, with coarser
 * grids preferred on a tie. The winning loop is then written at its own
 * resolution, so a bar-per-chord loop found on a beat grid still reads as four
 * chords rather than sixteen.
 */
export function mainProgression(
  timeline: ChordSpan[],
  beats: Beat[] | null | undefined,
  bpm: number | null | undefined,
  timeSignature: string | null | undefined,
  key?: string | null,
): string[] | null {
  if (timeline.length < 2) return null;
  const startTime = timeline[0][0];
  const endTime = timeline[timeline.length - 1][1];
  const beatTimes = beatGrid(beats, bpm, startTime, endTime);
  if (beatTimes.length < 8) return null;

  const per = beatsPerBar(timeSignature);
  const barSeconds = (per * 60) / (bpm || DEFAULT_BPM);
  const denoised = dropArtifactChords(mergeAdjacent(timeline), barSeconds);

  // Coarse grids first; a finer one has to beat them outright to be chosen.
  const steps = [...new Set([per, Math.floor(per / 2), 1])].filter((s) => s >= 1);
  let best: string[] | null = null;
  let bestCoverage = 0;

  for (const step of steps) {
    const maxLen = Math.max(2, Math.round((MAX_LOOP_BARS * per) / step));
    for (let offset = 0; offset < step; offset++) {
      const grid = steppedGrid(beatTimes, step, offset);
      if (grid.length < 5) continue;
      const found = findLoop(quantize(denoised, grid), maxLen);
      if (found && found.coverage > bestCoverage) {
        bestCoverage = found.coverage;
        best = found.window;
      }
    }
  }

  if (!best || bestCoverage < MIN_COVERAGE) return null;
  return bestRotation(normalizeRuns(best), key);
}
