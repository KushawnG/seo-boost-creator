import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

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

  const creditsUsed = subscription ? (subscription.credits_total - subscription.credits_remaining) : 0;
  const creditsTotal = subscription?.credits_total || 5;
  const creditsPercent = (creditsUsed / creditsTotal) * 100;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Membership</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
              <p className="text-2xl font-bold text-primary capitalize">
                {subscription?.plan_type || 'Free'} Plan
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Credits</h3>
              <div className="space-y-2">
                <Progress value={creditsPercent} />
                <p className="text-sm text-gray-600">
                  {subscription?.credits_remaining || 0} credits remaining out of {creditsTotal}
                </p>
                {subscription?.current_period_end && (
                  <p className="text-sm text-gray-600">
                    Renews on {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Available Plans</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Pro Plan</h4>
                    <p className="text-2xl font-bold my-2">$9.99/mo</p>
                    <p className="text-sm text-gray-600 mb-4">50 credits/month</p>
                    <Button 
                      className="w-full" 
                      disabled={subscription?.plan_type === 'pro' || isLoading}
                      onClick={() => handleUpgrade('price_pro')}
                    >
                      {subscription?.plan_type === 'pro' ? 'Current Plan' : 'Upgrade'}
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Enterprise Plan</h4>
                    <p className="text-2xl font-bold my-2">$29.99/mo</p>
                    <p className="text-sm text-gray-600 mb-4">Unlimited credits</p>
                    <Button 
                      className="w-full"
                      disabled={subscription?.plan_type === 'enterprise' || isLoading}
                      onClick={() => handleUpgrade('price_enterprise')}
                    >
                      {subscription?.plan_type === 'enterprise' ? 'Current Plan' : 'Upgrade'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};