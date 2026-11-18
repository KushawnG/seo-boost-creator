// Captcha configuration, kept out of the component file so that one only
// exports a component (otherwise React Fast Refresh stops working for it).
//
// The site key is public by design — Cloudflare pairs it with a secret held
// in Supabase, which is what actually verifies the token.

export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? "";

/**
 * False until a site key is set, which is how the whole feature stays inert
 * until the key is deployed: the widget renders nothing, no token is sent,
 * and sign-up behaves exactly as it did before.
 */
export const captchaConfigured = (): boolean => TURNSTILE_SITE_KEY.length > 0;
