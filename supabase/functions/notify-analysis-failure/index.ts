import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// Emails the owner whenever an analysis fails, so a broken funnel can't sit
// unnoticed for weeks again. Called by a trigger on song_analysis via pg_net,
// authenticated with the same internal secret the transcription leg uses.
//
// Deliberately NOT sent for "No credits remaining": that is the paywall doing
// its job, not a failure, and it was the single most common "failure" in the
// history table. Alerts that cry wolf get filtered into a folder and then the
// real ones are missed too.

const OWNER_EMAIL = 'kushawnsingh@gmail.com';
// Must be a sender Brevo has verified, or delivery depends on domain-level
// auth that could tighten at any time. support@ is NOT verified on this
// account; hello@chordfinderai.com is.
const SENDER = { name: 'Chord Finder AI', email: 'hello@chordfinderai.com' };

// A burst means something systemic broke; after this many in an hour we send
// one "still failing" note instead of one mail per analysis.
const BURST_LIMIT = 5;

Deno.serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== Deno.env.get('INTERNAL_FN_SECRET')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'Brevo not configured' }), { status: 500 });

  const { analysisId } = await req.json();
  if (!analysisId) return new Response(JSON.stringify({ error: 'analysisId required' }), { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: a } = await supabase
    .from('song_analysis')
    .select('id, title, url, file_path, error_message, created_at, user_id')
    .eq('id', analysisId)
    .single();
  if (!a) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  // Who hit it, and is this their first ever attempt? That's the one that
  // decides whether they ever come back.
  const { data: userRow } = await supabase.auth.admin.getUserById(a.user_id);
  const email = userRow?.user?.email ?? 'unknown';

  const { count: priorCount } = await supabase
    .from('song_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', a.user_id)
    .eq('is_demo', false)
    .lt('created_at', a.created_at);
  const isFirstEver = (priorCount ?? 0) === 0;

  const { count: recentFailures } = await supabase
    .from('song_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  const burst = (recentFailures ?? 0) > BURST_LIMIT;
  const source = a.url ?? (a.file_path ? 'uploaded file' : 'unknown');

  const subject = burst
    ? `⚠️ ${recentFailures} analyses failed in the last hour`
    : `${isFirstEver ? '🔴 FIRST-EVER attempt failed' : 'Analysis failed'} — ${email}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5">
      <p style="margin:0 0 12px"><strong>${escapeHtml(a.error_message ?? 'No error recorded')}</strong></p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:3px 12px 3px 0;color:#666">User</td><td>${escapeHtml(email)}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">Song</td><td>${escapeHtml(a.title ?? '')}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">Source</td><td>${escapeHtml(source)}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">When</td><td>${a.created_at}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">Analysis</td><td>${a.id}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">Their first?</td><td>${isFirstEver ? 'YES — this user has never seen it work' : 'no'}</td></tr>
        <tr><td style="padding:3px 12px 3px 0;color:#666">Failed in last hour</td><td>${recentFailures ?? '?'}</td></tr>
      </table>
      ${burst ? '<p style="margin:14px 0 0;color:#b00">Several failures in a short window — likely systemic rather than one bad song.</p>' : ''}
      <p style="margin:14px 0 0;color:#666;font-size:13px">No credit was charged — credits are only spent on success.</p>
    </div>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: OWNER_EMAIL }],
      subject,
      htmlContent: html,
    }),
  });

  const body = await res.text();
  if (!res.ok) console.error('Brevo send failed:', res.status, body.slice(0, 200));
  return new Response(JSON.stringify({ sent: res.ok, status: res.status, isFirstEver, burst }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
