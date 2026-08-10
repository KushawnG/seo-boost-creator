import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BrandLogo } from "@/components/BrandLogo";
import { Search } from "lucide-react";
import { usePageMeta } from "@/lib/seo";

type Song = {
  slug: string;
  title: string;
  artist: string | null;
  song_key: string | null;
  bpm: number | null;
  main_chords: string[] | null;
  main_progression: string[] | null;
};

const SongLibrary = () => {
  const [q, setQ] = useState("");

  usePageMeta({
    title: "Song Chord Library — Find the Chords, Key & BPM of Any Song | Chord Finder AI",
    description:
      "Browse chords, key and BPM for popular songs. Free chord database — then play along with the chords synced to the music, with guitar & piano diagrams.",
    canonicalPath: "/songs",
  });

  const { data: songs, isLoading } = useQuery({
    queryKey: ["public-songs"],
    queryFn: async (): Promise<Song[]> => {
      const { data, error } = await supabase
        .from("public_songs")
        .select("slug,title,artist,song_key,bpm,main_chords,main_progression")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Song[];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return songs ?? [];
    return (songs ?? []).filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        (s.artist ?? "").toLowerCase().includes(term),
    );
  }, [songs, q]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7" />
            <span className="font-bold">Chord Finder AI</span>
          </Link>
          <Link to="/auth?signup=true">
            <Button size="sm">Analyze a song free</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-3xl font-bold">Song Chord Library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          The chords, key and BPM for {songs?.length ?? "hundreds of"} songs — and counting. Find a song, then
          play along with the chords <strong>synced to the music</strong>, with guitar &amp; piano diagrams.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by song or artist…"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Loading songs…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-muted-foreground">No songs found for “{q}”.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((s) => (
              <Link key={s.slug} to={`/songs/${s.slug}`}>
                <Card className="transition hover:border-primary/50 hover:shadow-md">
                  <CardContent className="p-4">
                    <div className="font-semibold leading-tight">{s.title}</div>
                    {s.artist && <div className="text-sm text-muted-foreground">{s.artist}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {s.song_key && <Badge variant="secondary">Key: {s.song_key}</Badge>}
                      {s.bpm && <Badge variant="secondary">{s.bpm} BPM</Badge>}
                    </div>
                    {s.main_progression && s.main_progression.length > 0 ? (
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">Progression: </span>
                        <span className="font-semibold">{s.main_progression.join(" → ")}</span>
                      </div>
                    ) : (
                      s.main_chords &&
                      s.main_chords.length > 0 && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {s.main_chords.join(" · ")}
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SongLibrary;
