import { useMemo, useRef, useState, useEffect } from "react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Lightbulb, Repeat, X } from "lucide-react";
import { type ChordSpan, formatChordName } from "@/lib/chords";
import {
  type ChordQuality,
  KEY_GUESS_OPTIONS,
  chordGuessMatch,
  diatonicChords,
  firstChord,
  keyGuessCorrect,
  mainChords,
  parseKey,
} from "@/lib/ear-training";
import { YouTubePlayer } from "@/components/analysis/YouTubePlayer";
import { EarTrainingToggle } from "@/components/EarTrainingToggle";
import { logPractice } from "@/lib/practice";
import { cn } from "@/lib/utils";

type Analysis = Database["public"]["Tables"]["song_analysis"]["Row"];

interface ChordGuess {
  pc: number;
  quality: ChordQuality;
  label: string; // the user's own spelling, e.g. "Bb" not "A#"
  letter: string;
  accidental: Accidental;
}

// Build-a-chord picker: note letter -> accidental -> quality
type Accidental = "natural" | "sharp" | "flat";
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;
const ACCIDENTAL_OFFSET: Record<Accidental, number> = { natural: 0, sharp: 1, flat: -1 };
const ACCIDENTAL_SUFFIX: Record<Accidental, string> = { natural: "", sharp: "#", flat: "b" };

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const EarTrainingView = ({
  analysis,
  timeline,
  audioUrl,
  onReveal,
}: {
  analysis: Analysis;
  timeline: ChordSpan[];
  audioUrl: string | undefined;
  onReveal: () => void;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  // Targets = the song's main chords, in the order they first appear.
  const targets = useMemo(() => mainChords(timeline, 4), [timeline]);
  const opening = useMemo(() => firstChord(timeline), [timeline]);
  const hasKey = !!parseKey(analysis.key);

  const [keyGuess, setKeyGuess] = useState("");
  const [keyResult, setKeyResult] = useState<boolean | null>(null); // null = unchecked
  const [accidentalPick, setAccidentalPick] = useState<Accidental>("natural");
  const [qualityPick, setQualityPick] = useState<ChordQuality>("maj");
  const [activeSlot, setActiveSlot] = useState(0);
  // One slot per target chord: locked (solved) or holding a pending guess.
  const [locked, setLocked] = useState<boolean[]>(() => targets.map(() => false));
  const [pending, setPending] = useState<(ChordGuess | null)[]>(() => targets.map(() => null));
  const [lastCheck, setLastCheck] = useState<{ newlyLocked: number; wrong: number } | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [firstChordRevealed, setFirstChordRevealed] = useState(false);
  const [qualitiesRevealed, setQualitiesRevealed] = useState(false);
  const [hintLog, setHintLog] = useState<string[]>([]);
  const [showDiatonic, setShowDiatonic] = useState(false);

  const lockedCount = locked.filter(Boolean).length;
  const allLocked = targets.length > 0 && lockedCount === targets.length;
  const keyKnown = keyRevealed || keyResult === true;
  const won = allLocked && (keyKnown || !hasKey);
  const diatonic = useMemo(
    () => (keyKnown ? diatonicChords(analysis.key) : null),
    [keyKnown, analysis.key],
  );

  // Songs loop automatically in this mode; autoplay is best-effort.
  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, [audioUrl]);

  // Winning an ear-training round counts as a practice day
  useEffect(() => {
    if (won) void logPractice();
  }, [won]);

  const buildChord = (letter: string, accidental: Accidental, quality: ChordQuality): ChordGuess => ({
    pc: (((LETTER_PC[letter] + ACCIDENTAL_OFFSET[accidental]) % 12) + 12) % 12,
    quality,
    label: letter + ACCIDENTAL_SUFFIX[accidental] + (quality === "min" ? "m" : ""),
    letter,
    accidental,
  });

  // First empty, unlocked slot at or after `from` (wrapping), else -1.
  const nextEmptySlot = (fromPending: (ChordGuess | null)[], fromLocked: boolean[], from = 0): number => {
    for (let step = 0; step < targets.length; step++) {
      const i = (from + step) % targets.length;
      if (!fromLocked[i] && fromPending[i] === null) return i;
    }
    return -1;
  };

  // Tap a note letter: fill the highlighted slot and advance to the next open one.
  const pickNote = (letter: string) => {
    if (locked[activeSlot]) return;
    const wasEmpty = pending[activeSlot] === null;
    const next = [...pending];
    next[activeSlot] = buildChord(letter, accidentalPick, qualityPick);
    setPending(next);
    setLastCheck(null);
    if (wasEmpty) {
      const advanceTo = nextEmptySlot(next, locked, activeSlot + 1);
      if (advanceTo !== -1) {
        setActiveSlot(advanceTo);
        setAccidentalPick("natural");
        setQualityPick("maj");
      }
    }
  };

  // Accidental/quality act as presets — and live-edit the highlighted chord.
  const pickAccidental = (a: Accidental) => {
    setAccidentalPick(a);
    const current = pending[activeSlot];
    if (current && !locked[activeSlot]) {
      const next = [...pending];
      next[activeSlot] = buildChord(current.letter, a, current.quality);
      setPending(next);
      setLastCheck(null);
    }
  };

  const pickQuality = (q: ChordQuality) => {
    setQualityPick(q);
    const current = pending[activeSlot];
    if (current && !locked[activeSlot]) {
      const next = [...pending];
      next[activeSlot] = buildChord(current.letter, current.accidental, q);
      setPending(next);
      setLastCheck(null);
    }
  };

  // Tap a slot to target it; toggles sync to its chord so it can be edited.
  const selectSlot = (i: number) => {
    if (locked[i]) return;
    setActiveSlot(i);
    const chord = pending[i];
    if (chord) {
      setAccidentalPick(chord.accidental);
      setQualityPick(chord.quality);
    }
  };

  const clearSlot = (i: number) => {
    if (locked[i]) return;
    const next = [...pending];
    next[i] = null;
    setPending(next);
    setActiveSlot(i);
    setLastCheck(null);
  };

  const checkAnswers = () => {
    const nextLocked = [...locked];
    let newlyLocked = 0;
    let wrong = 0;
    for (const guess of pending) {
      if (!guess) continue;
      const hit = targets.findIndex((t, j) => !nextLocked[j] && chordGuessMatch(guess.pc, guess.quality, t));
      if (hit >= 0) {
        nextLocked[hit] = true;
        newlyLocked++;
      } else {
        wrong++;
      }
    }
    const cleared = targets.map(() => null);
    setLocked(nextLocked);
    setPending(cleared);
    if (hasKey && keyGuess) setKeyResult(keyGuessCorrect(keyGuess, analysis.key));
    setLastCheck({ newlyLocked, wrong });
    const nextActive = nextEmptySlot(cleared, nextLocked);
    if (nextActive !== -1) setActiveSlot(nextActive);
    setAccidentalPick("natural");
    setQualityPick("maj");
  };

  // Keep the highlight off locked slots (hints can lock the active one).
  useEffect(() => {
    if (locked[activeSlot]) {
      const next = nextEmptySlot(pending, locked, activeSlot + 1);
      if (next !== -1) setActiveSlot(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const canCheck = pending.some((p) => p !== null) || (!!keyGuess && keyResult === null);

  // Progressive hints: one button that escalates. Each press gives the next
  // most useful nudge, and the last chord is never given away.
  const qualityCounts = useMemo(() => {
    let maj = 0;
    let min = 0;
    for (const t of targets) {
      const quality = t.endsWith(":min") ? "min" : t.endsWith(":maj") ? "maj" : null;
      if (quality === "maj") maj++;
      if (quality === "min") min++;
    }
    return { maj, min };
  }, [targets]);

  const nextHintAvailable =
    (hasKey && !keyKnown) ||
    (!!opening && !firstChordRevealed) ||
    !qualitiesRevealed ||
    locked.filter((l) => !l).length >= 2;

  const takeHint = () => {
    if (hasKey && !keyKnown) {
      setKeyRevealed(true);
      setHintLog([...hintLog, `The key is ${analysis.key}.`]);
      return;
    }
    if (opening && !firstChordRevealed) {
      setFirstChordRevealed(true);
      setHintLog([...hintLog, `The song opens on ${formatChordName(opening)}.`]);
      return;
    }
    if (!qualitiesRevealed) {
      setQualitiesRevealed(true);
      setHintLog([
        ...hintLog,
        `The progression has ${qualityCounts.maj} major and ${qualityCounts.min} minor chord${qualityCounts.min === 1 ? "" : "s"}.`,
      ]);
      return;
    }
    // Last resort: lock one unsolved chord — but never the final one.
    const unlockedIdxs = locked.map((l, i) => (l ? -1 : i)).filter((i) => i >= 0);
    if (unlockedIdxs.length >= 2) {
      const idx = unlockedIdxs[0];
      const nextLocked = [...locked];
      nextLocked[idx] = true;
      setLocked(nextLocked);
      const nextPending = [...pending];
      nextPending[idx] = null;
      setPending(nextPending);
      const remaining = unlockedIdxs.length - 1;
      setHintLog([
        ...hintLog,
        `Chord ${idx + 1} is ${formatChordName(targets[idx])} — locked it in for you.${
          remaining === 1 ? " The last one's all yours!" : ""
        }`,
      ]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Player */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <EarTrainingToggle />
            {analysis.bpm && <Badge variant="secondary">{analysis.bpm} BPM</Badge>}
          </div>
          {audioUrl ? (
            <>
              <audio ref={audioRef} src={audioUrl} controls loop className="w-full" />
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3 w-3" /> The song loops automatically — listen as many times
                as you need.
              </p>
            </>
          ) : analysis.youtube_id ? (
            <>
              <YouTubePlayer videoId={analysis.youtube_id} />
              <p className="mt-2 text-xs text-muted-foreground">
                Replay the video as many times as you need.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No audio available for this song.</p>
          )}
        </CardContent>
      </Card>

      {/* The game */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <h2 className="text-lg font-bold">What do you hear? 🎧</h2>
            <p className="text-sm text-muted-foreground">
              Fill every chord slot and name the key. Correct chords lock in — wrong guesses bounce
              out, so keep listening and try again.
            </p>
          </div>

          {/* Step 1 — key */}
          {hasKey && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Step 1 · The key{" "}
                {keyKnown && <span className="text-green-600 dark:text-green-400">✓</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={selectClass}
                  value={keyGuess}
                  onChange={(e) => {
                    setKeyGuess(e.target.value);
                    setKeyResult(null);
                  }}
                  disabled={keyKnown}
                >
                  <option value="">Pick a key…</option>
                  {KEY_GUESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {keyResult === true && <Badge className="bg-green-600">✓ Correct!</Badge>}
                {keyResult === false && <Badge variant="destructive">✗ Not it — listen again</Badge>}
                {keyRevealed && <Badge variant="secondary">Key: {analysis.key}</Badge>}
              </div>
            </div>
          )}

          {/* Step 2 — chord slots */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                Step {hasKey ? 2 : 1} · The chord progression
              </div>
              <Badge variant={allLocked ? "default" : "secondary"} className={cn(allLocked && "bg-green-600")}>
                {lockedCount}/{targets.length} chords locked
              </Badge>
            </div>

            <div className="flex flex-wrap gap-3">
              {targets.map((t, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  {locked[i] ? (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-green-600 bg-green-600/10 text-2xl font-bold text-green-700 dark:text-green-400">
                      {formatChordName(t)}
                    </div>
                  ) : (
                    <button
                      onClick={() => selectSlot(i)}
                      title={pending[i] ? "Tap to edit this guess" : "Tap to guess this slot"}
                      className={cn(
                        "group relative flex h-20 w-20 items-center justify-center rounded-xl border-2 font-bold transition",
                        pending[i]
                          ? "border-primary bg-primary/5 text-2xl"
                          : "border-dashed text-3xl text-muted-foreground/50",
                        i === activeSlot && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      {pending[i]?.label ?? "?"}
                      {pending[i] && (
                        <X
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSlot(i);
                          }}
                          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 rounded-full bg-background text-muted-foreground group-hover:block"
                        />
                      )}
                    </button>
                  )}
                  <span
                    className={cn(
                      "text-xs",
                      i === activeSlot && !locked[i] ? "font-bold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>

            {!allLocked && (
              <div className="space-y-2">
                {/* Note letters fill the highlighted slot directly */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {NOTE_LETTERS.map((letter) => (
                    <Button
                      key={letter}
                      size="sm"
                      variant={pending[activeSlot]?.letter === letter ? "default" : "outline"}
                      className="h-10 w-10 p-0 text-base font-bold"
                      onClick={() => pickNote(letter)}
                    >
                      {letter}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tap a note to fill slot {activeSlot + 1} — tap any slot to edit it.
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: "natural", label: "♮" },
                        { id: "sharp", label: "♯" },
                        { id: "flat", label: "♭" },
                      ] as { id: Accidental; label: string }[]
                    ).map(({ id, label }) => (
                      <Button
                        key={id}
                        size="sm"
                        variant={accidentalPick === id ? "default" : "outline"}
                        className="h-9 w-9 p-0 text-lg"
                        title={id}
                        onClick={() => pickAccidental(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: "maj", label: "Major" },
                        { id: "min", label: "Minor" },
                      ] as { id: ChordQuality; label: string }[]
                    ).map(({ id, label }) => (
                      <Button
                        key={id}
                        size="sm"
                        variant={qualityPick === id ? "default" : "outline"}
                        className="h-9 px-4"
                        onClick={() => pickQuality(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={checkAnswers} disabled={!canCheck}>
              Check answers
            </Button>
            {!won && nextHintAvailable && (
              <Button variant="outline" size="sm" onClick={takeHint}>
                <Lightbulb className="mr-1 h-4 w-4" />
                {hintLog.length === 0 ? "Hint" : "Another hint"}
              </Button>
            )}
          </div>

          {hintLog.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-300/50 bg-amber-500/5 p-3">
              {hintLog.map((hint, i) => (
                <p key={i} className="text-sm">
                  💡 {hint}
                </p>
              ))}
            </div>
          )}

          {/* Feedback */}
          {won ? (
            <div className="rounded-lg border border-green-600 bg-green-600/10 p-4 text-sm">
              <p className="font-semibold">
                🎉 You did it! {hasKey ? "Key and all" : "All"} {targets.length} chords locked in.
                That's a trained ear.
              </p>
            </div>
          ) : lastCheck ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm">
              <p>
                {lastCheck.newlyLocked > 0 && (
                  <>
                    🔒 <span className="font-bold">{lastCheck.newlyLocked}</span> chord
                    {lastCheck.newlyLocked > 1 ? "s" : ""} locked in!{" "}
                  </>
                )}
                {lastCheck.wrong > 0 && (
                  <>
                    <span className="font-bold">{lastCheck.wrong}</span> guess
                    {lastCheck.wrong > 1 ? "es weren't" : " wasn't"} in the song — they've been
                    cleared.{" "}
                  </>
                )}
                {lastCheck.newlyLocked === 0 && lastCheck.wrong === 0 && "Nothing new to check. "}
                Keep listening! 🎧
              </p>
            </div>
          ) : null}

          {/* Key helper */}
          {keyKnown && (
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={() => setShowDiatonic(!showDiatonic)}>
                {showDiatonic ? "Hide" : "Show"} the chords in this key
              </Button>
              {showDiatonic && diatonic && (
                <div className="flex flex-wrap gap-2">
                  {diatonic.map((c) => (
                    <span key={c} className="rounded-lg border bg-muted/40 px-3 py-1 text-sm font-semibold">
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {showDiatonic && (
                <p className="text-xs text-muted-foreground">
                  Most songs build their progression from these — but a few borrow from outside the
                  key.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button variant="ghost" className="text-muted-foreground" onClick={onReveal}>
          <Eye className="mr-2 h-4 w-4" /> Give up — reveal the full analysis
        </Button>
      </div>
    </div>
  );
};
