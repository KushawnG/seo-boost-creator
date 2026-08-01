import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Guitar, Loader2, Lock, Music, Piano } from "lucide-react";
import { YouTubePlayer, type PlayerHandle } from "@/components/analysis/YouTubePlayer";
import { GuitarChordDiagram } from "@/components/analysis/GuitarChordDiagram";
import { PianoChordDiagram } from "@/components/analysis/PianoChordDiagram";
import {
  type Beat,
  type ChordSpan,
  beatIndexAt,
  chordIndexAt,
  formatChordName,
  isNoChord,
} from "@/lib/chords";
import { type Instrument, hasDiagram } from "@/lib/chord-shapes";
import { useSubscription } from "@/hooks/use-subscription";
import { useEarTrainingMode } from "@/hooks/use-ear-training-mode";
import { EarTrainingView } from "@/components/analysis/EarTrainingView";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Analysis = Database['public']['Tables']['song_analysis']['Row'];

const PIXELS_PER_SECOND = 14;

const AnalysisDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: subscription } = useSubscription();
  const isPaid =
    subscription?.plan_type === 'pro' || subscription?.plan_type === 'premium';

  const { data: analysis, isLoading } = useQuery({
    queryKey: ['analysis', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('song_analysis')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as Analysis;
    },
    // Keep refreshing while the song is still being analyzed
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' ? 3000 : false,
  });

  // Diagrams unlock for paid plans, OR on the free demo song — a taste of the feature.
  const isDemo = !!analysis?.is_demo;
  const diagramsUnlocked = isPaid || isDemo;

  // Ear Training Mode (Pro/Premium): hide the answers and quiz the user instead.
  const [earMode] = useEarTrainingMode();
  const [earRevealed, setEarRevealed] = useState(false);
  useEffect(() => setEarRevealed(false), [id]);

  const [instrument, setInstrument] = useState<Instrument>(
    () => (localStorage.getItem('chord-instrument') as Instrument) || 'off',
  );
  const selectInstrument = (next: Instrument) => {
    if (next !== 'off' && !diagramsUnlocked) {
      toast({
        title: "Chord diagrams are a Pro feature",
        description: "Upgrade to Pro or Premium to see guitar fingerings and piano keys synced with the song.",
      });
      return;
    }
    setInstrument(next);
    localStorage.setItem('chord-instrument', next);
  };

  const { data: audioUrl } = useQuery({
    queryKey: ['analysis-audio-url', analysis?.file_path],
    enabled: !!analysis?.file_path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('audio_files')
        .createSignedUrl(analysis!.file_path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const timeline = useMemo(
    () => (Array.isArray(analysis?.chords_timeline) ? (analysis!.chords_timeline as unknown as ChordSpan[]) : []),
    [analysis],
  );
  const beats = useMemo(
    () => (Array.isArray(analysis?.beats) ? (analysis!.beats as unknown as Beat[]) : []),
    [analysis],
  );
  const beatsPerBar = useMemo(
    () => (beats.length ? Math.round(Math.max(...beats.map(([, p]) => p))) : 4),
    [beats],
  );

  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeRef = useRef<PlayerHandle>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = audioRef.current
        ? audioRef.current.currentTime
        : youtubeRef.current?.getCurrentTime() ?? 0;
      setCurrentTime(time);
    }, 100);
    return () => window.clearInterval(timer);
  }, [analysis?.id]);

  const chordIdx = chordIndexAt(timeline, currentTime);
  const beatIdx = beatIndexAt(beats, currentTime);
  const currentBeatPos = beatIdx >= 0 ? Math.round(beats[beatIdx][1]) : 0;

  // Keep the active chord block centered in the strip
  useEffect(() => {
    if (chordIdx < 0 || !stripRef.current) return;
    const block = stripRef.current.querySelector<HTMLElement>(`[data-chord-idx="${chordIdx}"]`);
    block?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [chordIdx]);

  const seekTo = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
    } else {
      youtubeRef.current?.seekTo(seconds);
    }
  }, []);

  if (isLoading) {
    return (
      <PageShell>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading analysis...
        </div>
      </PageShell>
    );
  }

  if (!analysis) {
    return (
      <PageShell>
        <p className="text-muted-foreground">Analysis not found.</p>
      </PageShell>
    );
  }

  if (analysis.status === 'pending') {
    return (
      <PageShell title={analysis.title}>
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyzing this song — detecting beats, key and chords. This page will update automatically.
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (analysis.status === 'failed') {
    return (
      <PageShell title={analysis.title}>
        <Card>
          <CardContent className="p-6">
            <p className="font-medium text-red-600 dark:text-red-400">Analysis failed</p>
            <p className="mt-1 text-muted-foreground">{analysis.error_message || 'Something went wrong.'}</p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // Quiz view replaces the synced player (which would spoil the answers)
  if (earMode && isPaid && !earRevealed) {
    return (
      <PageShell title={analysis.title}>
        <EarTrainingView
          analysis={analysis}
          timeline={timeline}
          audioUrl={audioUrl}
          onReveal={() => setEarRevealed(true)}
        />
      </PageShell>
    );
  }

  const currentChord = chordIdx >= 0 ? timeline[chordIdx] : null;
  const nextChordSpan = timeline
    .slice(chordIdx >= 0 ? chordIdx + 1 : 0)
    .find(([, , name]) => !isNoChord(name));

  return (
    <PageShell title={analysis.title}>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {analysis.key && <Badge className="text-sm">Key: {analysis.key}</Badge>}
        {analysis.bpm && <Badge className="text-sm">{analysis.bpm} BPM</Badge>}
        {analysis.time_signature && <Badge className="text-sm">{analysis.time_signature}</Badge>}
      </div>

      {isDemo && !isPaid && (
        <Card className="mb-6 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="text-xl">🎁</span>
              <div>
                <p className="text-sm font-semibold">
                  This is your free demo song — chord diagrams are unlocked here.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tap the guitar 🎸 or piano 🎹 icon above to see the fingerings. Upgrade to Pro to
                  unlock diagrams on every song you analyze.
                </p>
              </div>
            </div>
            <Link to="/dashboard?tab=billing" className="shrink-0">
              <Button size="sm">Unlock diagrams on all songs</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Player */}
        <Card>
          <CardContent className="p-4">
            {analysis.youtube_id ? (
              <YouTubePlayer ref={youtubeRef} videoId={analysis.youtube_id} />
            ) : audioUrl ? (
              <div className="flex h-full min-h-[120px] flex-col justify-center gap-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Music className="h-5 w-5" />
                  <span className="truncate">{analysis.title}</span>
                </div>
                <audio ref={audioRef} src={audioUrl} controls className="w-full" />
              </div>
            ) : (
              <div className="flex min-h-[120px] items-center justify-center text-muted-foreground">
                Loading audio...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Now playing */}
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 p-6">
            <div className="flex w-full items-center justify-between">
              <div className="text-sm uppercase tracking-wide text-muted-foreground">Current chord</div>
              <div className="flex items-center gap-1">
                {([
                  { id: 'off' as const, icon: Music, label: 'Chord names only' },
                  { id: 'guitar' as const, icon: Guitar, label: 'Guitar diagrams' },
                  { id: 'piano' as const, icon: Piano, label: 'Piano keys' },
                ]).map(({ id: mode, icon: Icon, label }) => (
                  <Button
                    key={mode}
                    variant={instrument === mode ? "secondary" : "ghost"}
                    size="icon"
                    className="relative h-9 w-9"
                    title={mode !== 'off' && !diagramsUnlocked ? `${label} (Pro feature)` : label}
                    onClick={() => selectInstrument(mode)}
                  >
                    <Icon className="h-5 w-5" />
                    {mode !== 'off' && !diagramsUnlocked && (
                      <Lock className="absolute -right-0.5 -top-0.5 h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                ))}
              </div>
            </div>
            <div className="text-6xl font-bold tabular-nums">
              {currentChord ? formatChordName(currentChord[2]) : '—'}
            </div>
            {instrument !== 'off' && diagramsUnlocked && currentChord && hasDiagram(currentChord[2]) && (
              instrument === 'guitar' ? (
                <GuitarChordDiagram chord={currentChord[2]} className="h-28 w-auto" />
              ) : (
                <PianoChordDiagram chord={currentChord[2]} className="h-16 w-auto" />
              )
            )}
            {nextChordSpan && (
              <div className="text-muted-foreground">
                Next: <span className="font-semibold text-foreground">{formatChordName(nextChordSpan[2])}</span>
              </div>
            )}
            {beats.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                {Array.from({ length: beatsPerBar }, (_, i) => i + 1).map((pos) => (
                  <span
                    key={pos}
                    className={cn(
                      "h-3 w-3 rounded-full transition-all duration-100",
                      pos === currentBeatPos
                        ? pos === 1
                          ? "scale-125 bg-primary"
                          : "scale-110 bg-primary/70"
                        : "bg-muted",
                    )}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chord timeline */}
      {timeline.length > 0 ? (
        <Card className="mt-6">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Chord timeline</h2>
              <span className="text-sm text-muted-foreground">Click a chord to jump there</span>
            </div>
            <div ref={stripRef} className="overflow-x-auto pb-2">
              <div className="flex gap-1">
                {timeline.map(([start, end, name], idx) => (
                  <button
                    key={`${start}-${idx}`}
                    data-chord-idx={idx}
                    title={isNoChord(name) ? "No chord" : undefined}
                    onClick={() => seekTo(start)}
                    style={{ minWidth: Math.max(56, (end - start) * PIXELS_PER_SECOND) }}
                    className={cn(
                      "flex shrink-0 flex-col items-center justify-center rounded-md border px-2 py-3 transition-colors",
                      idx === chordIdx
                        ? "border-primary bg-primary text-primary-foreground"
                        : isNoChord(name)
                          ? "border-dashed bg-muted/40 text-muted-foreground/60 hover:bg-accent"
                          : "bg-background hover:bg-accent/50",
                    )}
                  >
                    <span className="text-lg font-semibold">{formatChordName(name)}</span>
                    <span className={cn("text-xs", idx === chordIdx ? "text-primary-foreground/80" : "text-muted-foreground/60")}>
                      {formatTime(start)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-6">
          <CardContent className="p-6 text-muted-foreground">
            <p>
              This song was analyzed before synced chords were available, so only the chord list is
              shown. Re-analyze the song to get the beat-synced timeline.
            </p>
            {analysis.chords && analysis.chords.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {analysis.chords.map((chord) => (
                  <Badge key={chord} variant="outline">{formatChordName(chord)}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chords used */}
      {timeline.length > 0 && analysis.chords && analysis.chords.length > 0 && (
        <Card className="mt-6">
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">Chords in this song</h2>
            <div className="flex flex-wrap gap-2">
              {analysis.chords.map((chord) => (
                <Badge key={chord} variant="outline" className="text-sm">
                  {formatChordName(chord)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
};

const PageShell = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <div className="min-h-screen bg-muted/40">
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
        </Link>
        {title && <h1 className="truncate text-xl font-bold">{title}</h1>}
      </div>
      {children}
    </div>
  </div>
);

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default AnalysisDetail;
