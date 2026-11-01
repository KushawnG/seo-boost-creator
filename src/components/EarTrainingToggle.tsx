import { Ear } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useEarTrainingMode } from "@/hooks/use-ear-training-mode";

// Open to everyone. Quizzing yourself on a song you already have costs us
// nothing, and gating it meant free users — the ones who never came back for a
// second day — had no reason to. The paid plans sell more analyses instead.
export function EarTrainingToggle() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useEarTrainingMode();

  const handleChange = (next: boolean) => {
    setEnabled(next);
    toast(
      next
        ? {
            title: "Ear Training Mode on",
            description: "Open any analyzed song and guess its key and chords by ear.",
          }
        : { title: "Ear Training Mode off", description: "Songs show their chords again." },
    );
  };

  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5">
      <Ear className="h-4 w-4 text-primary" />
      <span className="text-sm font-medium whitespace-nowrap">Ear Training</span>
      <Switch checked={enabled} onCheckedChange={handleChange} />
    </label>
  );
}
