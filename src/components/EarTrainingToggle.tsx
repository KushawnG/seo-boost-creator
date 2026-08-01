import { Ear, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/hooks/use-subscription";
import { useEarTrainingMode } from "@/hooks/use-ear-training-mode";

// Prominent mode switch: visible to everyone, usable on Pro/Premium. Free
// users get an upsell nudge instead of the toggle flipping.
export function EarTrainingToggle({ onUpsell }: { onUpsell?: () => void }) {
  const { toast } = useToast();
  const { data: subscription } = useSubscription();
  const isPaid = subscription?.plan_type === "pro" || subscription?.plan_type === "premium";
  const [enabled, setEnabled] = useEarTrainingMode();

  const handleChange = (next: boolean) => {
    if (!isPaid) {
      toast({
        title: "🎧 Ear Training is a Pro feature",
        description:
          "Upgrade to Pro or Premium to test yourself: guess the key and chords by ear, then check your answers.",
      });
      onUpsell?.();
      return;
    }
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
      {!isPaid && (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Lock className="h-3 w-3" /> Pro
        </Badge>
      )}
      <Switch checked={isPaid && enabled} onCheckedChange={handleChange} />
    </label>
  );
}
