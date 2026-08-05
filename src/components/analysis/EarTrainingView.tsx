import { useMemo, useRef, useState, useEffect } from "react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Eye, Lightbulb, Repeat, X } from "lucide-react";
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

// A slot's in-progress guess. It only counts (and the highlight only moves on)
// once all three parts have been explicitly chosen.
interface SlotDraft {
  letter: string | null;
  accidental: Accidental | null;
  quality: ChordQuality | null;
}

const EMPTY_DRAFT: SlotDraft = { letter: null, accidental: null, quality: null };

function draftComplete(d: SlotDraft): boolean {
  return d.letter !== null && d.accidental !== null && d.quality !== null;
}

function draftPc(d: SlotDraft): number {
  return (((LETTER_PC[d.letter!] + ACCIDENTAL_OFFSET[d.accidental ?? "natural"]) % 12) + 12) % 12;
}

function draftLabel(d: SlotDraft): string {
  if (!d.letter) return "";
  return (
    d.letter +
    (d.accidental ? ACCIDENTAL_SUFFIX[d.accidental] : "") +
    (d.quality === "min" ? "m" : "")
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
  const [activeSlot, setActiveSlot] = useState(0);
  // One slot per target chord: locked (solved) or holding an in-progress draft.
  const [locked, setLocked] = useState<boolean[]>(() => targets.map(() => false));
  const [drafts, setDrafts] = useState<SlotDraft[]>(() => targets.map(() => EMPTY_DRAFT));
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

  // First unlocked slot with an incomplete draft at or after `from` (wrapping), else -1.
  const nextOpenSlot = (fromDrafts: SlotDraft[], fromLocked: boolean[], from = 0): number => {
    for (let step = 0; step < targets.length; step++) {
      const i = (from + step) % targets.length;
      if (!fromLocked[i] && !draftComplete(fromDrafts[i])) return i;
    }
    return -1;
  };

  const updateDraft = (i: number, patch: Partial<SlotDraft>) => {
    if (locked[i]) return;
    const next = drafts.map((d, j) => (j === i ? { ...d, ...patch } : d));
    setDrafts(next);
    setLastCheck(null);
    // Advance only once the slot's chord is fully specified (note + accidental + quality)
    if (draftComplete(next[i])) {
      const advanceTo = nextOpenSlot(next, locked, i + 1);
      if (advanceTo !== -1 && advanceTo !== i) setActiveSlot(advanceTo);
    }
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
      if (!draftComplete(draft)) continue;
      const pc = draftPc(draft);
      const hit = targets.findIndex((t, j) => !nextLocked[j] && chordGuessMatch(pc, draft.quality!, t));
      if (hit >= 0) {
        nextLocked[hit] = true;
        newlyLocked++;
      } else {
        wrong++;
      }
    }
    const cleared = targets.map(() => EMPTY_DRAFT);
    setLocked(nextLocked);
    setDrafts(cleared);
    if (hasKey && keyGuess) setKeyResult(keyGuessCorrect(keyGuess, analysis.key));
    setLastCheck({ newlyLocked, wrong });
    const nextActive = nextOpenSlot(cleared, nextLocked);
    if (nextActive !== -1) setActiveSlot(nextActive);
  };

  // Keep the highlight off locked slots (hints can lock the active one).
  useEffect(() => {
    if (locked[activeSlot]) {
      const next = nextOpenSlot(drafts, locked, activeSlot + 1);
      if (next !== -1) setActiveSlot(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const canCheck =
    drafts.some((d) => draftComplete(d)) || (!!keyGuess && keyResult === null);

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
                    <div className="flex h-28 w-20 items-center justify-center rounded-xl border-2 border-green-600 bg-green-600/10 text-2xl font-bold text-green-700 dark:text-green-400">
                      {formatChordName(t)}
                    </div>
                  ) : (
                    <div
                      onClick={() => selectSlot(i)}
                      className={cn(
                        "group relative flex h-28 w-20 cursor-pointer flex-col items-center justify-between rounded-xl border-2 py-1 transition",
                        draftComplete(drafts[i])
                          ? "border-primary bg-primary/5"
                          : drafts[i].letter
                            ? "border-primary/50"
                            : "border-dashed",
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

            {!allLocked && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Use the arrows to pick slot {activeSlot + 1}'s note, then choose its accidental
                  and quality below.
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
                        variant={drafts[activeSlot]?.accidental === id ? "default" : "outline"}
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
                        variant={drafts[activeSlot]?.quality === id ? "default" : "outline"}
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
