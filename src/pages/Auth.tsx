import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { trackMetaEvent } from "@/lib/meta-pixel";

type Mode = "signin" | "signup" | "forgot" | "recovery";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>(
    searchParams.get("signup") === "true" ? "signup" : "signin",
  );
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setInfoMessage("Enter a new password for your account.");
        return;
      }

      if (event === "SIGNED_IN" && session && modeRef.current !== "recovery") {
        // Subscription rows are created server-side by a database trigger on
        // signup — the client can only read them.
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");
    setIsLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // navigation happens in the SIGNED_IN listener
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.user) {
          trackMetaEvent("CompleteRegistration");
        }
        if (data.user && !data.session) {
          setInfoMessage("Check your inbox — we sent you a link to confirm your account.");
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        setInfoMessage("Check your inbox — we sent you a password reset link.");
      } else if (mode === "recovery") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast({ title: "Password updated", description: "You're all set." });
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  const heading =
    mode === "signup" ? "Create your account"
    : mode === "forgot" ? "Reset your password"
    : mode === "recovery" ? "Set a new password"
    : "Sign in to your account";

  const submitLabel =
    mode === "signup" ? "Sign up"
    : mode === "forgot" ? "Send reset link"
    : mode === "recovery" ? "Update password"
    : "Sign in";

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrorMessage("");
    setInfoMessage("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <BrandLogo className="h-12 w-12 mx-auto" />
          </Link>
          <h2 className="mt-6 text-3xl font-extrabold text-foreground">{heading}</h2>
        </div>

        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        {infoMessage && (
          <Alert>
            <AlertDescription>{infoMessage}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode !== "recovery" && (
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={isLoading}
              />
            </div>
          )}

          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">
                {mode === "recovery" ? "New password" : "Password"}
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground space-y-2">
          {mode === "signin" && (
            <>
              <p>
                Don't have an account?{" "}
                <button onClick={() => switchMode("signup")} className="font-medium text-foreground underline">
                  Sign up
                </button>
              </p>
              <p>
                <button onClick={() => switchMode("forgot")} className="underline">
                  Forgot your password?
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p>
              Already have an account?{" "}
              <button onClick={() => switchMode("signin")} className="font-medium text-foreground underline">
                Sign in
              </button>
            </p>
          )}
          {(mode === "forgot" || mode === "recovery") && (
            <p>
              <button onClick={() => switchMode("signin")} className="underline">
                Back to sign in
              </button>
            </p>
          )}
          <p className="pt-4 text-xs text-muted-foreground">
            Need help?{" "}
            <a href="mailto:support@chordfinderai.com" className="underline">
              support@chordfinderai.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
