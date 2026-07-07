// Adds a new signup to the Brevo contact list. Called by a database trigger
// on auth.users (see migration), authenticated with a shared secret because
// pg_net cannot mint user JWTs. Deploy with --no-verify-jwt.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get('BREVO_WEBHOOK_SECRET');
    if (!secret || req.headers.get('x-webhook-secret') !== secret) {
      return json({ success: false, error: 'Unauthorized' }, 401);
    }

    const apiKey = Deno.env.get('BREVO_API_KEY');
    const listId = Number(Deno.env.get('BREVO_LIST_ID'));
    if (!apiKey || !listId) {
      return json({ success: false, error: 'Brevo not configured' }, 500);
    }

    const { email, user_id } = await req.json();
    if (!email || typeof email !== 'string') {
      return json({ success: false, error: 'email is required' }, 400);
    }

    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
        attributes: { SUPABASE_USER_ID: user_id ?? null },
      }),
    });

    // 201 created, 204 updated existing contact
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      console.error('Brevo contact create failed:', response.status, body.slice(0, 300));
      return json({ success: false, error: `Brevo error ${response.status}` }, 502);
    }

    console.log('Subscribed to Brevo list:', email);
    return json({ success: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error('brevo-subscribe error:', message);
    return json({ success: false, error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
