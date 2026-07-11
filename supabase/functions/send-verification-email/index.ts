// Sends a "verify your email" link to the signed-in user (non-blocking — they
// already have access). Creates a one-time token and emails it via Brevo. The
// link lands on /verify, which POSTs the token to verify-email; because a
// link-scanner only GETs the page (never runs the POST), the token survives
// pre-fetching and is still valid when the real user clicks. Requires a user JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_ORIGIN = 'https://chordfinderai.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.email) {
      return json({ error: 'Not authenticated' }, 401);
    }

    // Already verified? Nothing to do.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('email_verified')
      .eq('user_id', user.id)
      .maybeSingle();
    if (sub?.email_verified) {
      return json({ alreadyVerified: true }, 200);
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    if (!apiKey) {
      return json({ error: 'Email not configured' }, 500);
    }

    // Dedupe: if we already sent one moments ago (e.g. a double-fired signup or
    // a quick resend), don't send another — the first email's link still works.
    const since = new Date(Date.now() - 90_000).toISOString();
    const { data: recent } = await supabase
      .from('email_verification_tokens')
      .select('token')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) {
      console.log('Skipping duplicate verification email for', user.email);
      return json({ success: true, deduped: true }, 200);
    }

    // Hygiene: clear only EXPIRED tokens; leave valid ones so earlier emailed
    // links keep working. Then mint a fresh token.
    await supabase
      .from('email_verification_tokens')
      .delete()
      .eq('user_id', user.id)
      .lt('expires_at', new Date().toISOString());
    const { data: tokenRow, error: tokenError } = await supabase
      .from('email_verification_tokens')
      .insert({ user_id: user.id })
      .select('token')
      .single();
    if (tokenError || !tokenRow) {
      throw new Error(tokenError?.message ?? 'Could not create verification token');
    }

    const link = `${APP_ORIGIN}/verify?token=${tokenRow.token}`;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Chord Finder AI', email: 'hello@chordfinderai.com' },
        to: [{ email: user.email }],
        subject: 'Verify your email — Chord Finder AI',
        htmlContent: emailHtml(link),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Brevo send failed:', response.status, body.slice(0, 300));
      return json({ error: `Email error ${response.status}` }, 502);
    }

    console.log('Verification email sent to', user.email);
    return json({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('send-verification-email error:', message);
    return json({ error: message }, 500);
  }
});

function emailHtml(link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 8px">Confirm your email</h2>
    <p style="color:#555;line-height:1.5;margin:0 0 24px">
      Thanks for joining Chord Finder AI! Tap the button below to verify your email and secure your account.
    </p>
    <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
      Verify my email
    </a>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:24px 0 0">
      Or paste this link into your browser:<br>
      <a href="${link}" style="color:#2563eb;word-break:break-all">${link}</a>
    </p>
    <p style="color:#aaa;font-size:12px;margin:24px 0 0">
      Didn't sign up? You can ignore this email. Need help? support@chordfinderai.com
    </p>
  </div>`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
