import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { PaymentMethodsList } from "../billing/PaymentMethodsList";
import { BillingHistory } from "../billing/BillingHistory";

type PaymentMethod = Database['public']['Tables']['payment_methods']['Row']
type Subscription = Database['public']['Tables']['subscriptions']['Row']

export const BillingTab = () => {
  const { toast } = useToast();

  const { data: paymentMethods, refetch: refetchPaymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;
      return data as PaymentMethod[];
    }
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      // If no subscription exists, return a default free subscription
      if (!data) {
        return {
          plan_type: 'free',
          credits_remaining: 5,
          credits_total: 5,
          current_period_end: null,
          current_period_start: null,
          cancel_at_period_end: false,
        } as Subscription;
      }

      return data as Subscription;
    }
  });

  const handleRemovePaymentMethod = async (paymentMethodId: string) => {
    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', paymentMethodId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment method removed successfully.",
      });

      refetchPaymentMethods();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove payment method. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelSubscription = async () => {
    try {
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
        description: "Your subscription has been cancelled. You will be downgraded to the Free plan at the end of your billing period.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel subscription. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Billing</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <PaymentMethodsList 
              paymentMethods={paymentMethods}
              onRemovePaymentMethod={handleRemovePaymentMethod}
            />
            <BillingHistory 
              subscription={subscription}
              onCancelSubscription={handleCancelSubscription}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};