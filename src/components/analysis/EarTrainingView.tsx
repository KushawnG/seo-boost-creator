import { useMemo, useRef, useState, useEffect } from "react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Lightbulb, Plus, Repeat, X } from "lucide-react";
import { type ChordSpan, formatChordName } from "@/lib/chords";
import {
  type ChordQuality,
  KEY_GUESS_OPTIONS,
  ROOT_GUESS_OPTIONS,
  chordGuessMatch,
  diatonicChords,
  firstChord,
  guessLabel,
  keyGuessCorrect,
  mainChords,
  parseKey,
} from "@/lib/ear-training";
import { YouTubePlayer } from "@/components/analysis/YouTubePlayer";
import { EarTrainingToggle } from "@/components/EarTrainingToggle";
import { cn } from "@/lib/utils";

type Analysis = Database["public"]["Tables"]["song_analysis"]["Row"];

interface ChordGuess {
  pc: number;
  quality: ChordQuality;
}

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
  const [rootPick, setRootPick] = useState("");
  const [qualityPick, setQualityPick] = useState<ChordQuality>("maj");
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

  const freeSlot = pending.findIndex((p, i) => !locked[i] && p === null);

  const placeChord = () => {
    if (rootPick === "" || freeSlot === -1) return;
    const guess = { pc: Number(rootPick), quality: qualityPick };
    const next = [...pending];
    next[freeSlot] = guess;
    setPending(next);
    setLastCheck(null);
  };

  const clearSlot = (i: number) => {
    if (locked[i]) return;
    const next = [...pending];
    next[i] = null;
    setPending(next);
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
    setLocked(nextLocked);
    setPending(targets.map(() => null));
    if (hasKey && keyGuess) setKeyResult(keyGuessCorrect(keyGuess, analysis.key));
    setLastCheck({ newlyLocked, wrong });
  };

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
      setHintLog([
        ...hintLog,
        `Chord ${idx + 1} is ${formatChordName(targets[idx])} — locked it in for you. The last one's all yours!`,
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
                  ) : pending[i] ? (
                    <button
                      onClick={() => clearSlot(i)}
                      title="Remove this guess"
                      className="group relative flex h-20 w-20 items-center justify-center rounded-xl border-2 border-primary bg-primary/5 text-2xl font-bold"
                    >
                      {guessLabel(pending[i]!.pc, pending[i]!.quality)}
                      <X className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 rounded-full bg-background text-muted-foreground group-hover:block" />
                    </button>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed text-3xl font-bold text-muted-foreground/50">
                      ?
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select className={selectClass} value={rootPick} onChange={(e) => setRootPick(e.target.value)}>
                <option value="">Root…</option>
                {ROOT_GUESS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={qualityPick}
                onChange={(e) => setQualityPick(e.target.value as ChordQuality)}
              >
                <option value="maj">Major</option>
                <option value="min">Minor</option>
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={placeChord}
                disabled={rootPick === "" || freeSlot === -1}
              >
                <Plus className="mr-1 h-4 w-4" /> Place in slot {freeSlot === -1 ? "—" : freeSlot + 1}
              </Button>
            </div>
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
