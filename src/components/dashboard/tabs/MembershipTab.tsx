import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { Music, Zap, Clock, Lock } from "lucide-react";

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
                  {subscription?.credits_remaining || 0} analyses remaining out of {creditsTotal}
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
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Free Plan</h4>
                    <p className="text-2xl font-bold my-2">$0/mo</p>
                    <ul className="text-sm text-gray-600 space-y-2 mb-4">
                      <li className="flex items-center">
                        <Music className="h-4 w-4 text-primary mr-2" />
                        5 analyses/month
                      </li>
                      <li className="flex items-center">
                        <Clock className="h-4 w-4 text-primary mr-2" />
                        30 sec per song
                      </li>
                      <li className="flex items-center">
                        <Zap className="h-4 w-4 text-primary mr-2" />
                        Basic features
                      </li>
                    </ul>
                    <Button 
                      className="w-full" 
                      disabled={subscription?.plan_type === 'free' || isLoading}
                    >
                      Current Plan
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Pro Plan</h4>
                    <p className="text-2xl font-bold my-2">$9/mo</p>
                    <ul className="text-sm text-gray-600 space-y-2 mb-4">
                      <li className="flex items-center">
                        <Music className="h-4 w-4 text-primary mr-2" />
                        25 analyses/month
                      </li>
                      <li className="flex items-center">
                        <Clock className="h-4 w-4 text-primary mr-2" />
                        4 min per song
                      </li>
                      <li className="flex items-center">
                        <Zap className="h-4 w-4 text-primary mr-2" />
                        All basic features
                      </li>
                    </ul>
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
                    <h4 className="font-semibold">Premium Plan</h4>
                    <p className="text-2xl font-bold my-2">$25/mo</p>
                    <ul className="text-sm text-gray-600 space-y-2 mb-4">
                      <li className="flex items-center">
                        <Music className="h-4 w-4 text-primary mr-2" />
                        100 analyses/month
                      </li>
                      <li className="flex items-center">
                        <Clock className="h-4 w-4 text-primary mr-2" />
                        4 min per song
                      </li>
                      <li className="flex items-center">
                        <Lock className="h-4 w-4 text-primary mr-2" />
                        Stem Splitter
                      </li>
                    </ul>
                    <Button 
                      className="w-full"
                      disabled={subscription?.plan_type === 'premium' || isLoading}
                      onClick={() => handleUpgrade('price_premium')}
                    >
                      {subscription?.plan_type === 'premium' ? 'Current Plan' : 'Upgrade'}
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