import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// Tells someone a free song has appeared in their account. Called by
// deliver_gift_songs() through pg_net, once per delivery.
//
// The song is the hook, but the goal is the habit: every mail also points at
// the thing they can do without us — analyze a song they actually chose.

const SENDER = { name: 'Chord Finder AI', email: 'hello@chordfinderai.com' };
const SITE = 'https://chordfinderai.com';

const WEEK_COPY: Record<number, { teaches: string; why: string }> = {
  1: {
    teaches: 'two chords, and a lot of patience',
    why: 'It moves slowly, which makes it a kind song to play along with while you find the changes.',
  },
  2: {
    teaches: 'I–vi–IV–V — the progression behind hundreds of songs',
    why: "It's in the same key as Three Little Birds, so the shapes you already know carry straight over. There's only one new chord to learn.",
  },
  3: {
    teaches: 'I–V–vi–IV, on piano as much as guitar',
    why: 'A new key, and the progression you will hear in more pop songs than any other once you know it.',
  },
};

Deno.serve(async (req) => {
  if (req.headers.get('x-internal-secret') !== Deno.env.get('INTERNAL_FN_SECRET')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'Brevo not configured' }), { status: 500 });

  const { analysisId, week } = await req.json();
  if (!analysisId) return new Response(JSON.stringify({ error: 'analysisId required' }), { status: 400 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: a } = await supabase
    .from('song_analysis')
    .select('id, title, key, bpm, main_progression, user_id')
    .eq('id', analysisId)
    .single();
  if (!a) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const { data: userRow } = await supabase.auth.admin.getUserById(a.user_id);
  const email = userRow?.user?.email;
  if (!email) return new Response(JSON.stringify({ error: 'no email' }), { status: 404 });

  // Chords are stored as "A:maj" / "F#:min" — nobody wants to read that.
  const pretty = (chord: string) =>
    chord.replace(':maj', '').replace(':min', 'm').replace(':', '');
  const progression = Array.isArray(a.main_progression)
    ? [...new Set(a.main_progression.map(pretty))].join(' – ')
    : '';

  const copy = WEEK_COPY[Number(week)] ?? { teaches: '', why: '' };
  const song = String(a.title ?? 'a new song').replace(/\s+—\s+.*$/, '');

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:16px;line-height:1.55;color:#111;max-width:520px">
      <p style="margin:0 0 16px">There's a free song waiting in your account.</p>
      <div style="border:1px solid #e3e3e3;border-radius:10px;padding:16px;margin:0 0 18px">
        <p style="margin:0 0 6px;font-size:18px;font-weight:600">${escapeHtml(song)}</p>
        <p style="margin:0;color:#555;font-size:14px">
          ${escapeHtml(a.key ?? '')}${a.bpm ? ` · ${a.bpm} BPM` : ''}${progression ? ` · ${escapeHtml(progression)}` : ''}
        </p>
      </div>
      ${copy.teaches ? `<p style="margin:0 0 14px">It teaches <strong>${escapeHtml(copy.teaches)}</strong>. ${escapeHtml(copy.why)}</p>` : ''}
      <p style="margin:0 0 22px">
        It's already analyzed — chords synced to the music, guitar and piano diagrams,
        and Ear Training if you'd rather work them out yourself first.
      </p>
      <p style="margin:0 0 22px">
        <a href="${SITE}/dashboard/analysis/${a.id}"
           style="background:#4f8ff7;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">
          Play it now
        </a>
      </p>
      <p style="margin:0 0 6px;color:#555;font-size:14px">
        Or bring your own — paste any YouTube link and we'll work out its chords:
        <a href="${SITE}/dashboard" style="color:#4f8ff7">chordfinderai.com</a>
      </p>
      <p style="margin:18px 0 0;color:#999;font-size:12px">
        You're getting this because you signed up to Chord Finder AI.
      </p>
    </div>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email }],
      subject: `🎁 A free song for you — ${song}`,
      htmlContent: html,
    }),
  });

  const body = await res.text();
  if (!res.ok) console.error('Brevo gift send failed:', res.status, body.slice(0, 200));
  return new Response(JSON.stringify({ sent: res.ok, status: res.status, to: email, song }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
