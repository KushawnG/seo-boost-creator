// Ad blockers and privacy shields (Brave Shields, uBlock, AdGuard) can block
// Stripe's scripts and break the checkout page with a generic error. We can't
// fix the checkout page itself (it's on stripe.com), but we can detect likely
// blockers before redirecting and warn the user so they aren't left confused.

const PROBE_URLS = [
  // Stripe telemetry — the endpoint aggressive blockers cut first
  'https://r.stripe.com/b',
  // Stripe.js — if this is blocked, checkout cannot work at all
  'https://js.stripe.com/v3/',
];

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    // no-cors: we only care whether the request is allowed to leave the
    // browser, not what comes back
    await fetch(url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
    return true;
  } catch {
    return false; // rejected immediately → almost certainly a blocker
  } finally {
    window.clearTimeout(timer);
  }
}

/** True when a content blocker is likely to break the Stripe checkout page. */
export async function paymentsLikelyBlocked(timeoutMs = 2500): Promise<boolean> {
  try {
    const results = await Promise.all(PROBE_URLS.map((url) => probe(url, timeoutMs)));
    return results.some((ok) => !ok);
  } catch {
    return false; // never block the flow on a detector failure
  }
}

export const BLOCKER_HELP_MESSAGE =
  "Your browser's ad blocker or privacy shield may prevent the secure payment page from loading. " +
  "If it shows an error, temporarily disable it for stripe.com (in Brave: click the lion icon → Shields down) or use another browser.";
