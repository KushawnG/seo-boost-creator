import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const PLAN_BY_PRICE: Record<string, { plan: string; credits: number }> = {
  [Deno.env.get('STRIPE_PRICE_PRO') ?? 'price_pro']: { plan: 'pro', credits: 15 },
  [Deno.env.get('STRIPE_PRICE_PREMIUM') ?? 'price_premium']: { plan: 'premium', credits: 40 },
};

const FREE_PLAN = { plan: 'free', credits: 3 };

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) throw new Error('Webhook secret not configured');

    // constructEvent (sync) throws in Deno — SubtleCrypto is async-only
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    console.log('Processing webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await applySubscription(subscription);
        break;
      }

      case 'customer.subscription.updated': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }

      case 'invoice.paid': {
        // Renewal payments refill the month's credits
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        await applySubscription(subscription, { refillCredits: true });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata.supabaseUid;
        if (!userId) throw new Error('No Supabase user ID in metadata');

        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan_type: FREE_PLAN.plan,
            credits_total: FREE_PLAN.credits,
            credits_remaining: FREE_PLAN.credits,
            credits_reset_at: new Date().toISOString(),
            stripe_subscription_id: null,
            stripe_price_id: null,
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
            status: 'active',
          })
          .eq('user_id', userId);
        if (error) throw error;
        console.log('Downgraded to free:', userId);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook error';
    console.error('Error processing webhook:', message);
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

async function applySubscription(
  subscription: Stripe.Subscription,
  options: { refillCredits?: boolean } = {},
): Promise<void> {
  const userId = subscription.metadata.supabaseUid;
  if (!userId) throw new Error('No Supabase user ID in metadata');

  const priceId = subscription.items.data[0]?.price.id ?? '';
  const planInfo = PLAN_BY_PRICE[priceId] ?? FREE_PLAN;

  const { data: current } = await supabase
    .from('subscriptions')
    .select('plan_type')
    .eq('user_id', userId)
    .maybeSingle();

  const planChanged = current?.plan_type !== planInfo.plan;
  const refill = options.refillCredits || planChanged;

  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        plan_type: planInfo.plan,
        credits_total: planInfo.credits,
        ...(refill
          ? { credits_remaining: planInfo.credits, credits_reset_at: new Date().toISOString() }
          : {}),
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        status: subscription.status === 'active' || subscription.status === 'trialing'
          ? 'active'
          : subscription.status === 'past_due'
            ? 'past_due'
            : 'canceled',
      },
      { onConflict: 'user_id' },
    );
  if (error) throw error;

  console.log('Applied subscription:', { userId, plan: planInfo.plan, refill });
}
