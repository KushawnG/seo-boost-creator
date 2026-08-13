import { useMemo, useRef, useState, useEffect } from "react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Eye, Lightbulb, ListMusic, Repeat, X } from "lucide-react";
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

// A slot's in-progress guess. A note alone is a complete guess — accidental
// defaults to natural and quality to major unless explicitly chosen.
interface SlotDraft {
  letter: string | null;
  accidental: Accidental | null;
  quality: ChordQuality | null;
}

const EMPTY_DRAFT: SlotDraft = { letter: null, accidental: null, quality: null };

function draftGradeable(d: SlotDraft): boolean {
  return d.letter !== null;
}

function draftAccidental(d: SlotDraft): Accidental {
  return d.accidental ?? "natural";
}

function draftQuality(d: SlotDraft): ChordQuality {
  return d.quality ?? "maj";
}

function draftPc(d: SlotDraft): number {
  return (((LETTER_PC[d.letter!] + ACCIDENTAL_OFFSET[draftAccidental(d)]) % 12) + 12) % 12;
}

function draftLabel(d: SlotDraft): string {
  if (!d.letter) return "";
  return (
    d.letter +
    ACCIDENTAL_SUFFIX[draftAccidental(d)] +
    (draftQuality(d) === "min" ? "m" : "")
  );
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
  progression,
  audioUrl,
  onReveal,
}: {
  analysis: Analysis;
  timeline: ChordSpan[];
  progression: string[] | null;
  audioUrl: string | undefined;
  onReveal: () => void;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  // Guess the loop the song actually repeats — in its real order. A chord held
  // for two bars is one thing to hear, so back-to-back repeats collapse into a
  // single slot; a chord that comes back later in the loop keeps its own slot,
  // because recognising the return is the whole skill. Only when no loop could
  // be found does this fall back to the most-played chords, which is a fuzzier
  // target (it can include a chord from a one-off section).
  const targets = useMemo(() => {
    const loop = (progression ?? []).filter((chord, i, all) => i === 0 || chord !== all[i - 1]);
    return loop.length >= 2 ? loop : mainChords(timeline, 4);
  }, [progression, timeline]);
  const opening = useMemo(() => firstChord(timeline), [timeline]);
  const hasKey = !!parseKey(analysis.key);

  const [keyGuess, setKeyGuess] = useState("");
  const [keyResult, setKeyResult] = useState<boolean | null>(null); // null = unchecked
  const [activeSlot, setActiveSlot] = useState(0);
  // One slot per target chord: locked (solved) or holding an in-progress draft.
  const [locked, setLocked] = useState<boolean[]>(() => targets.map(() => false));
  // Which locks the player earned vs. which a hint handed them — the give-up
  // summary scores those differently.
  const [hintLocked, setHintLocked] = useState<boolean[]>(() => targets.map(() => false));
  const [surrendered, setSurrendered] = useState(false);
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => targets.map(() => EMPTY_DRAFT));
  const [lastCheck, setLastCheck] = useState<{ newlyLocked: number; wrong: number } | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [firstChordRevealed, setFirstChordRevealed] = useState(false);
  const [qualitiesRevealed, setQualitiesRevealed] = useState(false);
  const [hintLog, setHintLog] = useState<string[]>([]);
  const [showDiatonic, setShowDiatonic] = useState(false);

  const lockedCount = locked.filter(Boolean).length;
  const hintCount = hintLocked.filter(Boolean).length;
  const solvedYourself = lockedCount - hintCount;
  const missedCount = targets.length - lockedCount;
  const allLocked = targets.length > 0 && lockedCount === targets.length;
  const keyKnown = keyRevealed || keyResult === true;
  const won = allLocked && (keyKnown || !hasKey);
  // Giving up also puts the key on screen, so the "chords in this key" helper
  // becomes useful study material rather than a spoiler.
  const keyShown = keyKnown || surrendered;
  const diatonic = useMemo(
    () => (keyShown ? diatonicChords(analysis.key) : null),
    [keyShown, analysis.key],
  );

  // Songs loop automatically in this mode; autoplay is best-effort.
  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, [audioUrl]);

  // Winning an ear-training round counts as a practice day
  useEffect(() => {
    if (won) void logPractice();
  }, [won]);

  // First unlocked slot at or after `from` (wrapping), else -1.
  const nextUnlockedSlot = (fromLocked: boolean[], from = 0): number => {
    for (let step = 0; step < targets.length; step++) {
      const i = (from + step) % targets.length;
      if (!fromLocked[i]) return i;
    }
    return -1;
  };

  // The highlight never moves on its own — only slot clicks (or a slot
  // getting locked under it) change it.
  const updateDraft = (i: number, patch: Partial<SlotDraft>) => {
    if (locked[i]) return;
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setLastCheck(null);
  };

  // Up/down arrows inside a slot cycle its note letter A..G — but only for the
  // highlighted slot. On any other slot the first tap just selects it, so a
  // stray tap can't silently change a chord you weren't looking at.
  const cycleNote = (i: number, direction: 1 | -1) => {
    if (locked[i]) return;
    if (i !== activeSlot) {
      setActiveSlot(i);
      return;
    }
    const current = drafts[i].letter;
    const idx = current === null
      ? (direction === 1 ? 0 : NOTE_LETTERS.length - 1)
      : (NOTE_LETTERS.indexOf(current as typeof NOTE_LETTERS[number]) + direction + NOTE_LETTERS.length) % NOTE_LETTERS.length;
    updateDraft(i, { letter: NOTE_LETTERS[idx] });
  };

  const pickAccidental = (a: Accidental) => updateDraft(activeSlot, { accidental: a });
  const pickQuality = (q: ChordQuality) => updateDraft(activeSlot, { quality: q });

  const selectSlot = (i: number) => {
    if (!locked[i]) setActiveSlot(i);
  };

  const clearSlot = (i: number) => {
    if (locked[i]) return;
    setDrafts(drafts.map((d, j) => (j === i ? EMPTY_DRAFT : d)));
    setActiveSlot(i);
    setLastCheck(null);
  };

  const checkAnswers = () => {
    const nextLocked = [...locked];
    let newlyLocked = 0;
    let wrong = 0;
    for (const draft of drafts) {
      if (!draftGradeable(draft)) continue;
      const pc = draftPc(draft);
      const hit = targets.findIndex((t, j) => !nextLocked[j] && chordGuessMatch(pc, draftQuality(draft), t));
      if (hit >= 0) {
        nextLocked[hit] = true;
        newlyLocked++;
      } else {
        wrong++;
      }
    }
    setLocked(nextLocked);
    setDrafts(targets.map(() => EMPTY_DRAFT));
    if (hasKey && keyGuess) setKeyResult(keyGuessCorrect(keyGuess, analysis.key));
    setLastCheck({ newlyLocked, wrong });
  };

  // Keep the highlight off locked slots (checks and hints can lock the active one).
  useEffect(() => {
    if (locked[activeSlot]) {
      const next = nextUnlockedSlot(locked, activeSlot + 1);
      if (next !== -1) setActiveSlot(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const canCheck =
    drafts.some((d) => draftGradeable(d)) || (!!keyGuess && keyResult === null);

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
      setHintLocked(hintLocked.map((h, j) => (j === idx ? true : h)));
      setDrafts(drafts.map((d, j) => (j === idx ? EMPTY_DRAFT : d)));
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
          {analysis.youtube_id ? (
            <>
              <YouTubePlayer videoId={analysis.youtube_id} loop />
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3 w-3" /> The video repeats automatically — listen as many
                times as you need.
              </p>
            </>
          ) : audioUrl ? (
            <>
              <audio ref={audioRef} src={audioUrl} controls loop className="w-full" />
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Repeat className="h-3 w-3" /> The song loops automatically — listen as many times
                as you need.
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
            <h2 className="text-lg font-bold">
              {surrendered ? "Here's what the song was doing 🎧" : "What do you hear? 🎧"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {surrendered
                ? "Every answer is revealed below — the song keeps looping, so play them back and hear how each one sits."
                : "Fill every chord slot and name the key. Correct chords lock in — wrong guesses bounce out, so keep listening and try again."}
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
                  disabled={keyKnown || surrendered}
                >
                  <option value="">Pick a key…</option>
                  {KEY_GUESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {keyResult === true && <Badge className="bg-green-600">✓ Correct!</Badge>}
                {keyResult === false && !surrendered && (
                  <Badge variant="destructive">✗ Not it — listen again</Badge>
                )}
                {keyRevealed && <Badge variant="secondary">Key: {analysis.key}</Badge>}
                {surrendered && !keyKnown && (
                  <Badge
                    variant="outline"
                    className="border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                  >
                    Missed — the key is {analysis.key}
                  </Badge>
                )}
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
                  {surrendered ? (
                    <div
                      className={cn(
                        "flex h-28 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 text-2xl font-bold",
                        !locked[i]
                          ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                          : hintLocked[i]
                            ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            : "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400",
                      )}
                    >
                      {formatChordName(t)}
                      <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                        {!locked[i] ? "missed" : hintLocked[i] ? "hint" : "you got it"}
                      </span>
                    </div>
                  ) : locked[i] ? (
                    <div className="flex h-28 w-20 items-center justify-center rounded-xl border-2 border-green-600 bg-green-600/10 text-2xl font-bold text-green-700 dark:text-green-400">
                      {formatChordName(t)}
                    </div>
                  ) : (
                    <div
                      onClick={() => selectSlot(i)}
                      className={cn(
                        "group relative flex h-28 w-20 cursor-pointer flex-col items-center justify-between rounded-xl border-2 py-1 transition",
                        drafts[i].letter ? "border-primary bg-primary/5" : "border-dashed",
                        i === activeSlot && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                      )}
                    >
                      <button
                        aria-label={`Slot ${i + 1} note up`}
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleNote(i, 1);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <ChevronUp className="h-5 w-5" />
                      </button>
                      <span
                        className={cn(
                          "text-2xl font-bold",
                          drafts[i].letter ? "" : "text-muted-foreground/40",
                        )}
                      >
                        {draftLabel(drafts[i]) || "–"}
                      </span>
                      <button
                        aria-label={`Slot ${i + 1} note down`}
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleNote(i, -1);
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </button>
                      {drafts[i].letter && (
                        <X
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSlot(i);
                          }}
                          className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 cursor-pointer rounded-full bg-background text-muted-foreground group-hover:block"
                        />
                      )}
                    </div>
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

            {!allLocked && !surrendered && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Use the arrows to pick slot {activeSlot + 1}'s note — accidental and quality
                  apply below (♮ Major unless you change them). Tap another slot to switch.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">Accidental</span>
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
                        variant={draftAccidental(drafts[activeSlot] ?? EMPTY_DRAFT) === id ? "default" : "outline"}
                        className="h-9 w-9 p-0 text-lg"
                        title={id}
                        onClick={() => pickAccidental(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">Quality</span>
                    {(
                      [
                        { id: "maj", label: "Major" },
                        { id: "min", label: "Minor" },
                      ] as { id: ChordQuality; label: string }[]
                    ).map(({ id, label }) => (
                      <Button
                        key={id}
                        size="sm"
                        variant={draftQuality(drafts[activeSlot] ?? EMPTY_DRAFT) === id ? "default" : "outline"}
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
          {!surrendered && (
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
          )}

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
          {surrendered ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
              <p className="font-semibold">
                Here's the answer. You had {solvedYourself} of {targets.length} chord
                {targets.length === 1 ? "" : "s"} on your own
                {hintCount > 0 ? `, ${hintCount} came from a hint` : ""}
                {missedCount > 0 ? `, and ${missedCount} got away` : ""}.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border-2 border-green-600 bg-green-600/20" />
                  you got it
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border-2 border-amber-500 bg-amber-500/20" />
                  hint
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm border-2 border-red-500 bg-red-500/20" />
                  missed
                </span>
              </div>
              <p className="text-muted-foreground">
                Listen once more with the answers in front of you — that's where the ear actually
                learns.
              </p>
            </div>
          ) : won ? (
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
          {keyShown && (
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

      {/* Exits: give up reveals the answers here; the play-along view is a
          separate, deliberate step so the answers don't yank you off the page. */}
      <div className="flex flex-wrap justify-center gap-2">
        {surrendered ? (
          <Button onClick={onReveal}>
            <ListMusic className="mr-2 h-4 w-4" /> Open the play-along view
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setSurrendered(true);
              setLastCheck(null);
            }}
          >
            <Eye className="mr-2 h-4 w-4" /> Give up — show me the answers
          </Button>
        )}
      </div>
      {surrendered && (
        <p className="-mt-3 text-center text-xs text-muted-foreground">
          The play-along view has the full timeline, chord diagrams and practice tools.
        </p>
      )}
    </div>
  );
};
