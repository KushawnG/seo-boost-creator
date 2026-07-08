import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription, useSubscriptionActions } from "@/hooks/use-subscription";
import { planFor } from "@/lib/plans";
import { CurrentPlan } from "../membership/CurrentPlan";
import { PaymentMethodsList, type PaymentMethodInfo } from "../billing/PaymentMethodsList";
import { BillingHistory, type InvoiceInfo } from "../billing/BillingHistory";

interface BillingInfo {
  hasCustomer: boolean;
  paymentMethods: PaymentMethodInfo[];
  invoices: InvoiceInfo[];
}

export const BillingTab = () => {
  const { toast } = useToast();
  const { data: subscription } = useSubscription();
  const { cancelSubscription, resumeSubscription, isWorking } = useSubscriptionActions();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const plan = planFor(subscription?.plan_type);
  const isPaidPlan = !!subscription?.stripe_subscription_id &&
    (subscription.plan_type === 'pro' || subscription.plan_type === 'premium');

  const { data: billing, isLoading: billingLoading } = useQuery({
    queryKey: ['billing-info'],
    queryFn: async (): Promise<BillingInfo> => {
      const { data, error } = await supabase.functions.invoke('billing-info', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      return data as BillingInfo;
    },
  });

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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Billing</h2>

      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <CurrentPlan subscription={subscription ?? undefined} />
                <span className="text-lg font-semibold shrink-0">{plan.price}</span>
              </div>

              {isPaidPlan && (
                subscription.cancel_at_period_end ? (
                  <Button
                    variant="outline"
                    className="w-fit"
                    onClick={resumeSubscription}
                    disabled={isWorking}
                  >
                    Resume subscription
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-fit border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={handleCancel}
                    disabled={isWorking}
                  >
                    Cancel subscription
                  </Button>
                )
              )}
            </div>

            <PaymentMethodsList
              paymentMethods={billing?.paymentMethods}
              isLoading={billingLoading}
              canManage={!!billing?.hasCustomer}
              onManage={openPortal}
              isOpeningPortal={isOpeningPortal}
            />

            <BillingHistory invoices={billing?.invoices} isLoading={billingLoading} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
