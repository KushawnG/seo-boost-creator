import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { ArrowLeft, Guitar, Piano, Play } from "lucide-react";
import { usePageMeta } from "@/lib/seo";

type Song = {
  slug: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  bpm: number | null;
  time_signature: string | null;
  main_chords: string[] | null;
};

const SongDetail = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: song, isLoading, isError } = useQuery({
    queryKey: ["public-song", slug],
    enabled: !!slug,
    queryFn: async (): Promise<Song | null> => {
      const { data, error } = await supabase
        .from("public_songs")
        .select("slug,title,artist,song_key,bpm,time_signature,main_chords")
        .eq("slug", slug!)
        .eq("published", true)
        .maybeSingle();
      if (error) throw error;
      return data as Song | null;
    },
  });

  const artistPart = song?.artist ? ` by ${song.artist}` : "";
  const chords = song?.main_chords?.join(" · ") ?? "";
  usePageMeta({
    title: song
      ? `${song.title}${artistPart} — Chords, Key & BPM | Chord Finder AI`
      : "Song — Chord Finder AI",
    description: song
      ? `${song.title}${artistPart} is in the key of ${song.song_key ?? "—"} at ${song.bpm ?? "—"} BPM. Main chords: ${chords}. Play along with the chords synced to the music, with guitar & piano diagrams.`
      : undefined,
    canonicalPath: slug ? `/songs/${slug}` : undefined,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <span className="font-bold">Chord Finder AI</span>
          </Link>
          <Link to="/auth?signup=true">
            <Button size="sm">Analyze a song free</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/songs" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All songs
        </Link>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : isError || !song ? (
          <div>
            <h1 className="text-2xl font-bold">Song not found</h1>
            <p className="mt-2 text-muted-foreground">
              We couldn't find that song. <Link to="/songs" className="underline">Browse the library</Link>.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold leading-tight">
              {song.title} Chords, Key &amp; BPM
            </h1>
            {song.artist && <p className="mt-1 text-lg text-muted-foreground">{song.artist}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              {song.song_key && <Badge className="text-sm">Key: {song.song_key}</Badge>}
              {song.bpm && <Badge className="text-sm">{song.bpm} BPM</Badge>}
              {song.time_signature && <Badge className="text-sm">{song.time_signature}</Badge>}
            </div>

            {song.main_chords && song.main_chords.length > 0 && (
              <Card className="mt-6">
                <CardContent className="p-6">
                  <div className="text-sm uppercase tracking-wide text-muted-foreground">Main chords</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {song.main_chords.map((c) => (
                      <span
                        key={c}
                        className="rounded-lg border bg-muted/40 px-4 py-2 text-xl font-bold tabular-nums"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    The main chords used throughout “{song.title}”. The full progression, timing, and
                    fingerings are available in the player below.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Conversion CTA */}
            <Card className="mt-6 border-primary/40 bg-primary/5">
              <CardContent className="p-6">
                <h2 className="text-xl font-bold">Want to actually play along? 🎸🎹</h2>
                <p className="mt-2 text-muted-foreground">
                  Open “{song.title}” in Chord Finder AI to watch the chords change <strong>in time with the
                  music</strong>, and unlock the exact <strong>guitar fingerings</strong> and <strong>piano
                  keys</strong> for every chord.
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2"><Play className="h-4 w-4 text-primary" /> Chords synced to the song as it plays</li>
                  <li className="flex items-center gap-2"><Guitar className="h-4 w-4 text-primary" /> Guitar chord diagrams <span className="text-muted-foreground">(Pro / Premium)</span></li>
                  <li className="flex items-center gap-2"><Piano className="h-4 w-4 text-primary" /> Piano key diagrams <span className="text-muted-foreground">(Pro / Premium)</span></li>
                </ul>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link to="/auth?signup=true">
                    <Button size="lg">Start free — analyze this song →</Button>
                  </Link>
                  <Link to="/#pricing">
                    <Button size="lg" variant="outline">See plans</Button>
                  </Link>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Free plan includes 3 songs/month. Guitar &amp; piano diagrams unlock with Pro or Premium.
                </p>
              </CardContent>
            </Card>

            <p className="mt-8 text-sm text-muted-foreground">
              <Link to="/songs" className="underline">Browse more songs &amp; their chords →</Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export default SongDetail;
