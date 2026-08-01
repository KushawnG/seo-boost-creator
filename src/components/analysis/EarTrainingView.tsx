import { useEffect, useMemo, useRef, useState } from "react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ear, Eye, Lightbulb, Plus, Repeat, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Analysis = Database["public"]["Tables"]["song_analysis"]["Row"];

interface ChordGuess {
  pc: number;
  quality: ChordQuality;
}

interface CheckResult {
  keyCorrect: boolean | null; // null = no key guess made
  chordResults: boolean[];
  found: number;
  total: number;
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

  const [keyGuess, setKeyGuess] = useState("");
  const [rootPick, setRootPick] = useState("");
  const [qualityPick, setQualityPick] = useState<ChordQuality>("maj");
  const [chordGuesses, setChordGuesses] = useState<ChordGuess[]>([]);
  const [checked, setChecked] = useState<CheckResult | null>(null);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [firstChordRevealed, setFirstChordRevealed] = useState(false);
  const [showDiatonic, setShowDiatonic] = useState(false);

  const targets = useMemo(() => mainChords(timeline, 4), [timeline]);
  const opening = useMemo(() => firstChord(timeline), [timeline]);
  const hasKey = !!parseKey(analysis.key);
  const keyKnown = keyRevealed || checked?.keyCorrect === true;
  const diatonic = useMemo(
    () => (keyKnown ? diatonicChords(analysis.key) : null),
    [keyKnown, analysis.key],
  );

  // Songs loop automatically in this mode; autoplay is best-effort (browsers
  // may require one interaction first — the controls are right there).
  useEffect(() => {
    audioRef.current?.play().catch(() => {});
  }, [audioUrl]);

  const addChordGuess = () => {
    if (rootPick === "") return;
    const guess = { pc: Number(rootPick), quality: qualityPick };
    if (chordGuesses.some((g) => g.pc === guess.pc && g.quality === guess.quality)) return;
    setChordGuesses([...chordGuesses, guess]);
    setChecked(null);
  };

  const removeChordGuess = (index: number) => {
    setChordGuesses(chordGuesses.filter((_, i) => i !== index));
    setChecked(null);
  };

  const checkAnswers = () => {
    const chordResults = chordGuesses.map((g) =>
      targets.some((t) => chordGuessMatch(g.pc, g.quality, t)),
    );
    const found = targets.filter((t) =>
      chordGuesses.some((g) => chordGuessMatch(g.pc, g.quality, t)),
    ).length;
    setChecked({
      keyCorrect: hasKey && keyGuess ? keyGuessCorrect(keyGuess, analysis.key) : null,
      chordResults,
      found,
      total: targets.length,
    });
  };

  const perfect =
    checked && checked.found === checked.total && (checked.keyCorrect === true || !hasKey);

  return (
    <div className="space-y-6">
      {/* Player */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Ear className="h-4 w-4 text-primary" /> Ear Training Mode
            </div>
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

      {/* Guesses */}
      <Card>
        <CardContent className="space-y-6 p-6">
          <div>
            <h2 className="text-lg font-bold">What do you hear? 🎧</h2>
            <p className="text-sm text-muted-foreground">
              Work out the key and the main chords by ear, then check your answers.
            </p>
          </div>

          {hasKey && (
            <div className="space-y-2">
              <label className="text-sm font-medium">The key</label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={selectClass}
                  value={keyGuess}
                  onChange={(e) => {
                    setKeyGuess(e.target.value);
                    setChecked(null);
                  }}
                >
                  <option value="">Pick a key…</option>
                  {KEY_GUESS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {checked?.keyCorrect === true && <Badge className="bg-green-600">✓ Correct!</Badge>}
                {checked?.keyCorrect === false && <Badge variant="destructive">✗ Not it</Badge>}
                {keyRevealed && (
                  <Badge variant="secondary">Key: {analysis.key}</Badge>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              The main chords <span className="text-muted-foreground">({targets.length} to find)</span>
            </label>
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
              <Button size="sm" variant="outline" onClick={addChordGuess} disabled={rootPick === ""}>
                <Plus className="mr-1 h-4 w-4" /> Add chord
              </Button>
            </div>

            {chordGuesses.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chordGuesses.map((g, i) => (
                  <span
                    key={`${g.pc}-${g.quality}`}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm font-semibold",
                      checked
                        ? checked.chordResults[i]
                          ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400"
                          : "border-destructive bg-destructive/10 text-destructive"
                        : "bg-muted/40",
                    )}
                  >
                    {guessLabel(g.pc, g.quality)}
                    {checked && (checked.chordResults[i] ? " ✓" : " ✗")}
                    <button onClick={() => removeChordGuess(i)} aria-label="Remove guess">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={checkAnswers} disabled={chordGuesses.length === 0 && !keyGuess}>
              Check answers
            </Button>
            {hasKey && !keyRevealed && (
              <Button variant="outline" size="sm" onClick={() => setKeyRevealed(true)}>
                <Lightbulb className="mr-1 h-4 w-4" /> Hint: reveal the key
              </Button>
            )}
            {opening && !firstChordRevealed && (
              <Button variant="outline" size="sm" onClick={() => setFirstChordRevealed(true)}>
                <Lightbulb className="mr-1 h-4 w-4" /> Hint: first chord
              </Button>
            )}
          </div>

          {firstChordRevealed && opening && (
            <p className="text-sm">
              The song opens on <span className="font-bold">{formatChordName(opening)}</span>.
            </p>
          )}

          {checked && (
            <div
              className={cn(
                "rounded-lg border p-4 text-sm",
                perfect ? "border-green-600 bg-green-600/10" : "bg-muted/40",
              )}
            >
              {perfect ? (
                <p className="font-semibold">
                  🎉 Perfect ear! You nailed {hasKey ? "the key and " : ""}all {checked.total} main
                  chords.
                </p>
              ) : (
                <p>
                  You've found <span className="font-bold">{checked.found}</span> of the{" "}
                  <span className="font-bold">{checked.total}</span> main chords
                  {hasKey && checked.keyCorrect === true && " — and the key is right"}
                  {hasKey && checked.keyCorrect === false && " — the key isn't right yet"}. Keep
                  listening!
                </p>
              )}
            </div>
          )}

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
