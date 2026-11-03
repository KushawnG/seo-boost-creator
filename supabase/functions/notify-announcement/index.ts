import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// One-off announcement emails. Driven by send_announcement(kind, limit), which
// records the send before calling here, so nobody is told the same thing twice.

const SENDER = { name: 'Chord Finder AI', email: 'hello@chordfinderai.com' };
const SITE = 'https://chordfinderai.com';

const ANNOUNCEMENTS: Record<string, { subject: string; body: (firstSong: string | null) => string }> = {
  features_unlocked: {
    subject: 'Ear Training, chord diagrams and streaks are now yours',
    body: (firstSong) => `
      <p style="margin:0 0 16px">Three things that used to be Pro-only are now in your account, for free:</p>
      <ul style="margin:0 0 18px;padding-left:20px">
        <li style="margin:0 0 8px"><strong>Guitar &amp; piano chord diagrams</strong> — the exact fingering for each chord, changing in time with the song.</li>
        <li style="margin:0 0 8px"><strong>Ear Training</strong> — hide the chords and work them out yourself, then check your answers.</li>
        <li style="margin:0 0 8px"><strong>Practice Streaks</strong> — a daily streak and a weekly goal, so the practice adds up.</li>
      </ul>
      <p style="margin:0 0 18px">
        They work on every song in your account${firstSong ? `, starting with <strong>${firstSong}</strong>` : ''} —
        nothing to upgrade, nothing to set up.
      </p>`,
  },
};

Deno.serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== Deno.env.get('INTERNAL_FN_SECRET')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'Brevo not configured' }), { status: 500 });

  const { userId, kind } = await req.json();
  const announcement = ANNOUNCEMENTS[String(kind)];
  if (!userId || !announcement) {
    return new Response(JSON.stringify({ error: 'unknown announcement' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: userRow } = await supabase.auth.admin.getUserById(userId);
  const email = userRow?.user?.email;
  if (!email) return new Response(JSON.stringify({ error: 'no email' }), { status: 404 });

  // Name a song they already have, so the mail points somewhere concrete
  // rather than at an empty dashboard.
  const { data: song } = await supabase
    .from('song_analysis')
    .select('title')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const firstSong = song?.title
    ? String(song.title)
        .replace(/\s+—\s+.*$/, '')
        .replace(/\s*[([](?:official|lyric|audio|video|remaster|hd|4k|mv|visuali[sz]er)[^)\]]*[)\]]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
    : null;

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.55;color:#111;max-width:540px">
      ${announcement.body(firstSong ? escapeHtml(firstSong) : null)}
      <p style="margin:0 0 22px">
        <a href="${SITE}/dashboard"
           style="background:#4f8ff7;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">
          Open Chord Finder AI
        </a>
      </p>
      <p style="margin:18px 0 0;color:#999;font-size:12px">
        You're getting this because you signed up to Chord Finder AI.
      </p>
    </div>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: SENDER, to: [{ email }], subject: announcement.subject, htmlContent: html }),
  });
  const body = await res.text();
  if (!res.ok) console.error('Brevo announcement failed:', res.status, body.slice(0, 200));
  return new Response(JSON.stringify({ sent: res.ok, status: res.status, to: email }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
