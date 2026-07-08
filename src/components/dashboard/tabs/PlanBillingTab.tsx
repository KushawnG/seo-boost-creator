import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription, useSubscriptionActions } from "@/hooks/use-subscription";
import { planFor } from "@/lib/plans";
import { paymentsLikelyBlocked, BLOCKER_HELP_MESSAGE } from "@/lib/payment-blockers";
import { trackMetaEvent, PLAN_VALUES } from "@/lib/meta-pixel";
import { Music, Zap, Clock } from "lucide-react";
import { PlanCard } from "../membership/PlanCard";
import { CreditsProgress } from "../membership/CreditsProgress";
import { CurrentPlan } from "../membership/CurrentPlan";
import { PaymentMethodsList, type PaymentMethodInfo } from "../billing/PaymentMethodsList";
import { BillingHistory, type InvoiceInfo } from "../billing/BillingHistory";

const PLANS = {
  FREE: {
    title: "Free Plan",
    price: "$0/mo",
    priceId: "free",
    features: [
      { icon: Music, text: "3 analyses/month" },
      { icon: Clock, text: "Songs up to 5 min" },
      { icon: Zap, text: "Last 5 analyses saved" }
    ],
    footnote: "Renews monthly for free"
  },
  PRO: {
    title: "Pro Plan",
    price: "$12/mo",
    priceId: "price_1TqmnqKtE1i0bFDaAWAThaFA",
    features: [
      { icon: Music, text: "15 analyses/month" },
      { icon: Clock, text: "Songs up to 5 min" },
      { icon: Zap, text: "Unlimited history" }
    ],
    footnote: "Cancel anytime"
  },
  PREMIUM: {
    title: "Premium Plan",
    price: "$29/mo",
    priceId: "price_1TqmnrKtE1i0bFDaQj84iDkT",
    features: [
      { icon: Music, text: "40 analyses/month" },
      { icon: Clock, text: "Songs up to 5 min" },
      { icon: Zap, text: "Unlimited history" }
    ],
    footnote: "Cancel anytime"
  }
};

interface BillingInfo {
  hasCustomer: boolean;
  paymentMethods: PaymentMethodInfo[];
  invoices: InvoiceInfo[];
}

export const PlanBillingTab = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const { data: subscription } = useSubscription();
  const { cancelSubscription, resumeSubscription, isWorking } = useSubscriptionActions();

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billing-info'],
    queryFn: async (): Promise<BillingInfo> => {
      const { data, error } = await supabase.functions.invoke('billing-info', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data as BillingInfo;
    },
  });

  const handleUpgrade = async (priceId: string) => {
    try {
      setIsLoading(true);

      const planKey = priceId === PLANS.PREMIUM.priceId ? 'premium' : 'pro';
      trackMetaEvent('InitiateCheckout', {
        value: PLAN_VALUES[planKey],
        currency: 'USD',
        content_name: planKey,
      });

      // Warn users whose ad blocker is likely to break the Stripe page
      const [blocked, sessionResult] = await Promise.all([
        paymentsLikelyBlocked(),
        supabase.functions.invoke('create-checkout-session', { body: { priceId } }),
      ]);
      if (blocked) {
        toast({
          title: "Ad blocker detected",
          description: BLOCKER_HELP_MESSAGE,
          duration: 10000,
        });
        // give the user a moment to read it before leaving the page
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      const { data, error } = sessionResult;
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Failed to start the upgrade. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    const confirmed = window.confirm(
      "Cancel your subscription? You keep your current plan until the end of the billing period, then move to the Free plan. You can resume anytime before then."
    );
    if (!confirmed) return;
    await cancelSubscription();
  };

  const openPortal = async () => {
    try {
      setIsOpeningPortal(true);
      const { data, error } = await supabase.functions.invoke('billing-portal', { body: {} });
      if (error || data?.error || !data?.url) {
        throw new Error(data?.error || error?.message || 'Could not open billing portal');
      }
      window.location.href = data.url;
    } catch (error) {
      console.error('Billing portal error:', error);
      toast({
        title: "Error",
        description: "Could not open the payment settings page. Please try again.",
        variant: "destructive",
      });
      setIsOpeningPortal(false);
    }
  };

  const creditsUsed = subscription ? (subscription.credits_total - subscription.credits_remaining) : 0;
  const creditsTotal = subscription?.credits_total || 3;
  const creditsPercent = (creditsUsed / creditsTotal) * 100;
  const currentPlanType = subscription?.plan_type || 'free';
  const isPaidPlan = currentPlanType === 'pro' || currentPlanType === 'premium';
  const plan = planFor(currentPlanType);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <CurrentPlan subscription={subscription ?? undefined} />
              <span className="shrink-0 text-lg font-semibold">{plan.price}</span>
            </div>

            {isPaidPlan && subscription?.stripe_subscription_id && (
              subscription.cancel_at_period_end ? (
                <Button
                  variant="outline"
                  onClick={resumeSubscription}
                  disabled={isWorking}
                >
                  Resume subscription
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                  onClick={handleCancel}
                  disabled={isWorking}
                >
                  Cancel subscription
                </Button>
              )
            )}

            <CreditsProgress
              subscription={subscription ?? undefined}
              creditsTotal={creditsTotal}
              creditsPercent={creditsPercent}
            />

            <div>
              <h3 className="mb-4 text-lg font-semibold">Available Plans</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {Object.values(PLANS).map((planOption) => {
                  const isCurrentPlan = currentPlanType === planOption.title.toLowerCase().split(' ')[0];
                  const showDowngrade = isPaidPlan && planOption.title === "Free Plan";

                  return (
                    <PlanCard
                      key={planOption.priceId}
                      {...planOption}
                      isCurrentPlan={isCurrentPlan}
                      isLoading={isLoading || isWorking}
                      onUpgrade={showDowngrade ? handleCancel : handleUpgrade}
                      buttonText={showDowngrade ? "Downgrade to Free" : isCurrentPlan ? "Current Plan" : `Upgrade to ${planOption.title}`}
                    />
                  );
                })}
              </div>
            </div>

            <Separator />

            <PaymentMethodsList
              paymentMethods={billing?.paymentMethods}
              isLoading={billingLoading}
              canManage={!!billing?.hasCustomer}
              onManage={openPortal}
              isOpeningPortal={isOpeningPortal}
            />

            <Separator />

            <BillingHistory invoices={billing?.invoices} isLoading={billingLoading} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
