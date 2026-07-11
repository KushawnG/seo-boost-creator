import { useState } from "react";
import { MailWarning, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// Non-blocking nudge shown to signed-in users who haven't verified their email.
// Verifying is optional — this never gates access, it just invites the user to
// secure their account and lets them resend the link.
export function VerifyEmailBanner() {
  const { data: subscription, isLoading } = useSubscription();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (isLoading || dismissed) return null;
  // No row yet, or already verified → nothing to show.
  if (!subscription || subscription.email_verified) return null;

  const resend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-verification-email", {
        body: {},
      });
      if (error) throw error;
      if (data?.alreadyVerified) {
        toast({ title: "Already verified", description: "Your email is confirmed." });
      } else {
        toast({
          title: "Verification email sent",
          description: "Check your inbox for the confirmation link.",
        });
      }
    } catch {
      toast({
        title: "Couldn't send email",
        description: "Please try again in a moment, or contact support@chordfinderai.com.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <MailWarning className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Verify your email to secure your account</p>
          <p className="text-xs opacity-80">
            You have full access already — verifying just helps you recover your account and stay
            in the loop.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
          {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send verification email
        </Button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-500/20"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
