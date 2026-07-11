// Marketing attribution: capture UTM / fbclid params off the landing URL and
// keep them in localStorage until the user signs up, so we can record which ad
// or campaign drove each signup. Last-paid-touch: any visit that arrives with
// UTMs overwrites the stored set (matches how Meta attributes), while the first
// landing context (referrer, page) is preserved.

const KEY = "cfai_attribution";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  referrer?: string;
  landing_page?: string;
};

/** Read UTM/fbclid off the current URL and persist them. No-op if none present. */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const hasSignal = UTM_KEYS.some((k) => params.get(k)) || !!params.get("fbclid");
    if (!hasSignal) return; // organic navigation — keep any prior touch

    const existing = getAttribution();
    const attribution: Attribution = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) attribution[k] = v;
    }
    const fbclid = params.get("fbclid");
    if (fbclid) attribution.fbclid = fbclid;
    // Preserve the earliest landing context across touches.
    attribution.referrer = existing?.referrer ?? (document.referrer || undefined);
    attribution.landing_page = existing?.landing_page ?? window.location.pathname;

    localStorage.setItem(KEY, JSON.stringify(attribution));
  } catch {
    // localStorage/URL unavailable (SSR, privacy mode) — attribution is best-effort.
  }
}

/** The stored attribution, or null. */
export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

/** Clear stored attribution (call after it's been attached to a signup). */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}
