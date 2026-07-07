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
    // { resume: true } undoes a scheduled cancellation
    const { resume = false } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return json({ error: 'Not authenticated' }, 401);
    }

    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!subRow?.stripe_subscription_id) {
      return json({ error: 'No active subscription to cancel' }, 400);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    // Cancel at period end so the user keeps what they paid for; the
    // customer.subscription.deleted webhook moves them to free afterwards.
    // Resuming simply clears the scheduled cancellation.
    await stripe.subscriptions.update(subRow.stripe_subscription_id, {
      cancel_at_period_end: !resume,
    });

    await supabase
      .from('subscriptions')
      .update({ cancel_at_period_end: !resume })
      .eq('user_id', user.id);

    return json({ success: true, resumed: resume }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel error';
    console.error('Error canceling subscription:', message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
