import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

interface CurrentPlanProps {
  subscription: Subscription | undefined;
}

export const CurrentPlan = ({ subscription }: CurrentPlanProps) => {
  const renewalDate = subscription?.current_period_end 
    ? format(new Date(subscription.current_period_end), 'MMMM d, yyyy')
    : null;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
      <p className="text-2xl font-bold text-primary capitalize mb-2">
        {subscription?.plan_type || 'Free'} Plan
      </p>
      {renewalDate && (
        <p className="text-sm text-gray-600">
          Renews on {renewalDate}
        </p>
      )}
    </div>
  );
};