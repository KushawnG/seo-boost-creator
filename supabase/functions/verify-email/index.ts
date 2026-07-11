// Marks a user's email as verified from a one-time token. Public (deploy with
// --no-verify-jwt) — the token IS the credential, POSTed by the /verify page.
// Link-scanners that merely GET the page never call this, so the token isn't
// consumed until the real user's browser runs the POST.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return json({ success: false, error: 'Missing token' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: row } = await supabase
      .from('email_verification_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (!row) {
      // Token already used (verification succeeded earlier) or never existed.
      return json({ success: false, error: 'This link is invalid or has already been used.' }, 200);
    }

    if (new Date(row.expires_at) < new Date()) {
      await supabase.from('email_verification_tokens').delete().eq('token', token);
      return json({ success: false, error: 'This link has expired. Send a new one from your dashboard.' }, 200);
    }

    await supabase
      .from('subscriptions')
      .update({ email_verified: true })
      .eq('user_id', row.user_id);

    // Single-use: consume the token now.
    await supabase.from('email_verification_tokens').delete().eq('user_id', row.user_id);

    console.log('Email verified for user', row.user_id);
    return json({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('verify-email error:', message);
    return json({ success: false, error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
