import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Announces a gift song once, the first time the user opens the app after it
// lands. The email is the primary notice, but plenty of people never open it —
// this catches everyone. Shown once per gift and then never again: after that
// they know the song is there, and a repeating popup is just an obstacle
// between them and the app.

interface UnseenGift {
  week: number;
  analysis_id: string;
  title: string | null;
  key: string | null;
  bpm: number | null;
  main_progression: string[] | null;
}

// Stored as "A:maj" / "F#:min"; nobody wants to read that.
const prettyChord = (chord: string) =>
  chord.replace(":maj", "").replace(":min", "m").replace(":", "");

// What each gift is actually for — the same reason the email gives, so the two
// don't tell different stories.
const WEEK_BLURB: Record<number, string> = {
  0: "It's already analyzed, so you can play along straight away — chords synced to the music, with guitar and piano diagrams.",
  1: "Gentle and slow, which makes it a kind song to play along with while you find the changes.",
  2: "It's in the same key as Three Little Birds, so the shapes you already know carry straight over. There's only one new chord.",
  3: "A new key, and the progression you'll hear in more pop songs than any other once you know it.",
};

export const GiftAnnouncement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: gift } = useQuery({
    queryKey: ["unseen-gift"],
    queryFn: async (): Promise<UnseenGift | null> => {
      const { data, error } = await supabase.rpc("unseen_gift");
      if (error) throw error;
      // The RPC is typed as Json because it returns jsonb; the shape is the
      // one SELECT in unseen_gift() builds, so go via unknown rather than
      // pretending Json and UnseenGift overlap.
      return (data as unknown as UnseenGift | null) ?? null;
    },
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: async (week: number) => {
      // Mark it seen before navigating: if this fails the user simply gets
      // told again next time, which is far better than losing the notice.
      const { error } = await supabase.rpc("mark_gift_seen", { p_week: week });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["unseen-gift"] }),
  });

  if (!gift) return null;

  // YouTube titles carry a lot of noise for a one-line announcement:
  // "Ben E. King - Stand By Me (Official Vinyl Video) — RHINO". Drop the
  // channel after the em dash and the parenthetical video descriptors.
  const song = (gift.title ?? "A new song")
    .replace(/\s+—\s+.*$/, "")
    .replace(/\s*[([](?:official|lyric|audio|video|remaster|hd|4k|mv|visuali[sz]er)[^)\]]*[)\]]/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const chords = Array.isArray(gift.main_progression)
    ? [...new Set(gift.main_progression.map(prettyChord))].join(" · ")
    : "";

  const close = () => dismiss.mutate(gift.week);
  const play = () => {
    dismiss.mutate(gift.week);
    navigate(`/dashboard/analysis/${gift.analysis_id}`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 text-4xl" aria-hidden>🎁</div>
          <DialogTitle>
            {gift.week === 0 ? "There's a song waiting for you" : "A free song, on us"}
          </DialogTitle>
          <DialogDescription>
            We've put <span className="font-medium text-foreground">{song}</span> in your
            account — free, and it doesn't use your credit.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="font-semibold">{song}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {[gift.key, gift.bpm ? `${gift.bpm} BPM` : null, chords]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {WEEK_BLURB[gift.week] && (
          <p className="text-sm text-muted-foreground">{WEEK_BLURB[gift.week]}</p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={close}>
            Later
          </Button>
          <Button onClick={play}>Play it now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
