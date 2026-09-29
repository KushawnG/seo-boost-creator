// Fetching a song's audio and working out its chords run as two separate
// server jobs, because neither reliably fits in one worker's time budget. An
// analysis therefore sits at 'extracted' — audio stored, chords still pending —
// in between. That's plumbing: to anyone reading the screen it's all just
// "analyzing", and every place that waits on or labels an analysis should say
// so rather than leaking the internal state name.

export const IN_PROGRESS_STATUSES = ['pending', 'processing', 'extracted'] as const;

export function isInProgress(status?: string | null): boolean {
  return !!status && (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

/** What to show on a status badge. */
export function statusLabel(status?: string | null): string {
  return isInProgress(status) ? 'analyzing' : status ?? 'unknown';
}
