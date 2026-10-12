// supabase-js rejects any non-2xx from an edge function with the same opaque
// message — "Edge Function returned a non-2xx status code" — and leaves the
// body, where our real message lives, inside error.context. Call sites that
// read error.message therefore showed users that string instead of what we
// actually said. A free user who ran out of credits was told the app had an
// internal error, so they retried instead of upgrading.
//
// This digs the real message out, and refuses to pass the opaque one through.

const OPAQUE = /non-2xx status code|Failed to send a request/i;

export async function functionErrorMessage(
  error: unknown,
  data: unknown,
  fallback: string,
): Promise<string> {
  // Some functions answer 200 with { success: false, error } — prefer that.
  const inBody = (data as { error?: unknown } | null)?.error;
  if (typeof inBody === 'string' && inBody.trim()) return inBody;

  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = body?.error ?? body?.message;
      if (typeof message === 'string' && message.trim()) return message;
    } catch {
      // not JSON — fall through to the generic message below
    }
  }

  const raw = (error as { message?: unknown } | null)?.message;
  if (typeof raw === 'string' && raw.trim() && !OPAQUE.test(raw)) return raw;

  return fallback;
}
