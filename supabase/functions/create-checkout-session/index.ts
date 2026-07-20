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
    const { priceId } = await req.json();

    // Only our own plan prices can be checked out
    const allowedPrices = [
      Deno.env.get('STRIPE_PRICE_PRO'),
      Deno.env.get('STRIPE_PRICE_PREMIUM'),
      Deno.env.get('STRIPE_PRICE_PRO_ANNUAL'),
      Deno.env.get('STRIPE_PRICE_PREMIUM_ANNUAL'),
    ].filter(Boolean);
    if (!priceId || !allowedPrices.includes(priceId)) {
      return json({ error: 'Unknown plan' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.email) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Reuse the customer if we have one, otherwise find/create by email
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const existing = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = existing.data[0]?.id ?? null;
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabaseUid: user.id },
      });
      customerId = customer.id;
    }

    await supabase
      .from('subscriptions')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);

    const origin = req.headers.get('origin') ?? 'https://chordfinderai.com';
    const isPremium =
      priceId === Deno.env.get('STRIPE_PRICE_PREMIUM') ||
      priceId === Deno.env.get('STRIPE_PRICE_PREMIUM_ANNUAL');
    const planName = isPremium ? 'premium' : 'pro';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${origin}/dashboard?checkout=success&plan=${planName}`,
      cancel_url: `${origin}/dashboard?checkout=canceled`,
      subscription_data: {
        metadata: { supabaseUid: user.id },
      },
    });

    return json({ url: session.url }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Checkout error';
    console.error('Error creating checkout session:', message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
