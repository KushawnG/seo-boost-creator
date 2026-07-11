import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "success" | "error";

// Landing page for the email-verification link. We POST the token to the
// verify-email function from here (client-side) so that mailbox link-scanners,
// which only GET this URL, never consume the one-time token before the real
// user's browser runs this code.
const VerifyEmail = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("");
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return; // React 18 StrictMode double-invoke guard
    hasRun.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing its token.");
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("verify-email", {
          body: { token },
        });
        if (error) throw error;
        if (data?.success) {
          setStatus("success");
          queryClient.invalidateQueries({ queryKey: ["subscription"] });
          // Give the user a beat to read the confirmation, then move on.
          setTimeout(() => navigate("/dashboard"), 2500);
        } else {
          setStatus("error");
          setMessage(data?.error ?? "We couldn't verify this link.");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong verifying your email. Please try again.");
      }
    })();
  }, [searchParams, navigate, queryClient]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <Link to="/" className="inline-block">
          <BrandLogo className="h-12 w-12 mx-auto" />
        </Link>

        {status === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Verifying your email…</h1>
            <p className="text-muted-foreground">Just a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <h1 className="text-2xl font-bold">Email confirmed! 🎉</h1>
            <p className="text-muted-foreground">
              Your account is secured. Taking you to your dashboard…
            </p>
            <Button asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h1 className="text-2xl font-bold">Verification failed</h1>
            <p className="text-muted-foreground">{message}</p>
            <Button asChild>
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Need help?{" "}
              <a href="mailto:support@chordfinderai.com" className="underline">
                support@chordfinderai.com
              </a>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
