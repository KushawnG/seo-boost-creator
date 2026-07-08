import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, useSubscriptionActions } from "@/hooks/use-subscription";
import { Music, Zap, Clock } from "lucide-react";
import { PlanCard } from "../membership/PlanCard";
import { CreditsProgress } from "../membership/CreditsProgress";
import { CurrentPlan } from "../membership/CurrentPlan";

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
    priceId: "price_1TqgisKtE1i0bFDaw3HGZZVz",
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
    priceId: "price_1TqgisKtE1i0bFDa3EqCvz0I",
    features: [
      { icon: Music, text: "40 analyses/month" },
      { icon: Clock, text: "Songs up to 5 min" },
      { icon: Zap, text: "Unlimited history" }
    ],
    footnote: "Cancel anytime"
  }
};

export const MembershipTab = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const { data: subscription } = useSubscription();
  const { cancelSubscription, resumeSubscription, isWorking } = useSubscriptionActions();

  const handleUpgrade = async (priceId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { priceId }
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast({
        title: "Error",
        description: "Failed to initiate upgrade. Please try again.",
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

  const creditsUsed = subscription ? (subscription.credits_total - subscription.credits_remaining) : 0;
  const creditsTotal = subscription?.credits_total || 3;
  const creditsPercent = (creditsUsed / creditsTotal) * 100;
  const currentPlanType = subscription?.plan_type || 'free';
  const isPaidPlan = currentPlanType === 'pro' || currentPlanType === 'premium';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Membership</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <CurrentPlan subscription={subscription ?? undefined} />

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
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
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
              <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                {Object.values(PLANS).map((plan) => {
                  const isCurrentPlan = currentPlanType === plan.title.toLowerCase().split(' ')[0];
                  const showDowngrade = isPaidPlan && plan.title === "Free Plan";
                  
                  return (
                    <PlanCard
                      key={plan.priceId}
                      {...plan}
                      isCurrentPlan={isCurrentPlan}
                      isLoading={isLoading || isWorking}
                      onUpgrade={showDowngrade ? handleCancel : handleUpgrade}
                      buttonText={showDowngrade ? "Downgrade to Free" : isCurrentPlan ? "Current Plan" : `Upgrade to ${plan.title}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};