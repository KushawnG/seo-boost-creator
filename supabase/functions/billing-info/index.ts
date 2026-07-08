// Returns the user's real billing state from Stripe: saved cards and invoices.
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

    const customerId = subRow?.stripe_customer_id;
    if (!customerId) {
      return json({ hasCustomer: false, paymentMethods: [], invoices: [] }, 200);
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const [customer, methods, invoices] = await Promise.all([
      stripe.customers.retrieve(customerId),
      stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 10 }),
      stripe.invoices.list({ customer: customerId, limit: 12 }),
    ]);

    const defaultPm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;

    return json({
      hasCustomer: true,
      paymentMethods: methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand ?? 'card',
        last4: pm.card?.last4 ?? '????',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        isDefault: pm.id === defaultPm,
      })),
      invoices: invoices.data
        .filter((inv) => inv.status !== 'draft')
        .map((inv) => ({
          id: inv.id,
          date: new Date(inv.created * 1000).toISOString(),
          description: inv.lines.data[0]?.description ?? 'Subscription',
          amount: inv.amount_paid || inv.amount_due,
          currency: inv.currency,
          status: inv.status,
          url: inv.hosted_invoice_url,
        })),
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Billing info error';
    console.error('billing-info error:', message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
