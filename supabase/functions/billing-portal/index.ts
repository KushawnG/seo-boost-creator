// Opens a Stripe customer portal session so users can manage payment methods.
import Stripe from 'https://esm.sh/stripe@14.21.0';
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Not authenticated' }, 401);

    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!subRow?.stripe_customer_id) {
      return json({ error: 'No billing account yet' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const origin = req.headers.get('origin') ?? 'https://chordfinderai.com';

    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: subRow.stripe_customer_id,
        return_url: `${origin}/dashboard`,
      });
    } catch (error) {
      // No default portal configuration yet — create a minimal one and retry
      if (error instanceof Error && /configuration/i.test(error.message)) {
        const config = await stripe.billingPortal.configurations.create({
          business_profile: { headline: 'Chord Finder AI' },
          features: {
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
          },
        });
        session = await stripe.billingPortal.sessions.create({
          customer: subRow.stripe_customer_id,
          configuration: config.id,
          return_url: `${origin}/dashboard`,
        });
      } else {
        throw error;
      }
    }

    return json({ url: session.url }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Portal error';
    console.error('billing-portal error:', message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
