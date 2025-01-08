import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  try {
    const body = await req.text();
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );

    console.log('Processing webhook event:', event.type);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0].price.id;
        
        // Determine plan type and credits based on price ID
        let planType = 'free';
        let creditsTotal = 5;
        
        if (priceId === 'price_pro') {
          planType = 'pro';
          creditsTotal = 50;
        } else if (priceId === 'price_enterprise') {
          planType = 'enterprise';
          creditsTotal = 999999; // Unlimited credits
        }

        // Get user ID from subscription metadata
        const supabaseUserId = subscription.metadata.supabaseUid;
        if (!supabaseUserId) {
          throw new Error('No Supabase user ID in metadata');
        }

        // Update or create subscription record
        const { error: upsertError } = await supabaseClient
          .from('subscriptions')
          .upsert({
            user_id: supabaseUserId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan_type: planType,
            credits_total: creditsTotal,
            credits_remaining: creditsTotal,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          });

        if (upsertError) {
          throw upsertError;
        }

        console.log('Successfully processed checkout session:', session.id);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const supabaseUserId = subscription.metadata.supabaseUid;
        
        if (!supabaseUserId) {
          throw new Error('No Supabase user ID in metadata');
        }

        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .update({
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })
          .eq('user_id', supabaseUserId);

        if (updateError) {
          throw updateError;
        }

        console.log('Successfully processed subscription update:', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const supabaseUserId = subscription.metadata.supabaseUid;
        
        if (!supabaseUserId) {
          throw new Error('No Supabase user ID in metadata');
        }

        // Reset subscription to free plan
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .update({
            plan_type: 'free',
            credits_total: 5,
            credits_remaining: 5,
            stripe_subscription_id: null,
            current_period_start: null,
            current_period_end: null,
            cancel_at_period_end: false,
          })
          .eq('user_id', supabaseUserId);

        if (updateError) {
          throw updateError;
        }

        console.log('Successfully processed subscription deletion:', subscription.id);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});