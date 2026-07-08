// Thin wrapper around the Meta Pixel. Every call is guarded: if the pixel is
// blocked by an ad blocker or hasn't loaded, tracking silently no-ops.

type Fbq = (command: string, event: string, params?: Record<string, unknown>) => void;

function fbq(): Fbq | null {
  const fn = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof fn === 'function' ? fn : null;
}

/** Fire a standard Meta event (CompleteRegistration, InitiateCheckout, Purchase, ...). */
export function trackMetaEvent(event: string, params?: Record<string, unknown>): void {
  try {
    fbq()?.('track', event, params);
  } catch {
    // never let analytics break the app
  }
}

/** SPA route changes don't reload the page, so PageView must be fired manually. */
export function trackPageView(): void {
  try {
    fbq()?.('track', 'PageView');
  } catch {
    // ignore
  }
}

export const PLAN_VALUES: Record<string, number> = {
  pro: 12,
  premium: 29,
};
