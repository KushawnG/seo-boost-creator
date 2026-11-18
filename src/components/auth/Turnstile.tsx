import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY, captchaConfigured } from "@/lib/captcha";

// Cloudflare Turnstile, the bot check in front of signup.
//
// Why it exists: between 10 and 18 November 2026 twenty accounts registered
// without ever running the app — no second session, no analysis, Gmail
// dot-trick and scraped-looking corporate addresses — and each one was then
// added to the mailing list and sent gift emails. Supabase had no captcha and
// auto-confirms email, so nothing stood between a script and an account.
//
// Turnstile over hCaptcha because it is free at any volume and usually solves
// itself without the visitor doing anything; Supabase verifies the token
// server-side, so a forged one fails at the auth endpoint rather than here.
//
// DEGRADES TO NOTHING. With no site key configured the widget renders nothing
// and onToken is never called, so sign-up and sign-in keep working exactly as
// before. That matters because the key arrives separately from this code: a
// deploy that got there first must not lock everyone out.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** Load the Turnstile script once, shared by every mount. */
let scriptPromise: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

interface Props {
  /** Fires with a token when the check passes, and with "" when it expires. */
  onToken: (token: string) => void;
  /** Bumping this re-runs the check — a token is single-use. */
  resetKey?: number;
}

export const Turnstile = ({ onToken, resetKey = 0 }: Props) => {
  const holder = useRef<HTMLDivElement | null>(null);
  // Held in a ref so re-renders don't tear the widget down and rebuild it.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!captchaConfigured() || !holder.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const el = holder.current;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        el.innerHTML = "";
        widgetId = window.turnstile.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
          theme: "auto",
        });
      })
      .catch(() => {
        // Cloudflare unreachable (offline, blocked by an extension). Leaving
        // the token empty would make the form unsubmittable, so let the
        // attempt through and let Supabase decide.
        onTokenRef.current("");
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // already gone
        }
      }
    };
  }, [resetKey]);

  if (!captchaConfigured()) return null;
  return <div ref={holder} className="flex justify-center" />;
};
