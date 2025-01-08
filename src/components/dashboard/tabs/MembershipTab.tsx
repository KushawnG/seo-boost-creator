import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { Music, Zap, Clock, Lock } from "lucide-react";
import { PlanCard } from "../membership/PlanCard";
import { CreditsProgress } from "../membership/CreditsProgress";
import { CurrentPlan } from "../membership/CurrentPlan";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

const PLANS = {
  FREE: {
    title: "Free Plan",
    price: "$0/mo",
    priceId: "price_1Qbl8cKtE1i0bFDa050g8sXL",
    features: [
      { icon: Music, text: "5 analyses/month" },
      { icon: Clock, text: "30 sec per song" },
      { icon: Zap, text: "Basic features" }
    ],
    footnote: "Renews monthly for free"
  },
  PRO: {
    title: "Pro Plan",
    price: "$9/mo",
    priceId: "price_1Qbl93KtE1i0bFDasRX5eE37",
    features: [
      { icon: Music, text: "25 analyses/month" },
      { icon: Clock, text: "4 min per song" },
      { icon: Zap, text: "All basic features" }
    ],
    footnote: "Cancel anytime"
  },
  PREMIUM: {
    title: "Premium Plan",
    price: "$25/mo",
    priceId: "price_1Qbl9VKtE1i0bFDaHWBPtG7g",
    features: [
      { icon: Music, text: "100 analyses/month" },
      { icon: Clock, text: "4 min per song" },
      { icon: Lock, text: "Stem Splitter" }
    ],
    footnote: "Cancel anytime"
  }
};

export const MembershipTab = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data as Subscription;
    }
  });

  const handleUpgrade = async (priceId: string) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const { url, error } = await response.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate upgrade. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDowngrade = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      const { error } = await response.json();
      if (error) throw new Error(error);

      toast({
        title: "Success",
        description: "Your subscription will be downgraded to the Free plan at the end of your billing period.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to downgrade subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const creditsUsed = subscription ? (subscription.credits_total - subscription.credits_remaining) : 0;
  const creditsTotal = subscription?.credits_total || 5;
  const creditsPercent = (creditsUsed / creditsTotal) * 100;
  const currentPlanType = subscription?.plan_type || 'free';
  const isPaidPlan = currentPlanType === 'pro' || currentPlanType === 'premium';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Membership</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <CurrentPlan subscription={subscription} />
            <CreditsProgress 
              subscription={subscription}
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
                      isLoading={isLoading}
                      onUpgrade={showDowngrade ? handleDowngrade : handleUpgrade}
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