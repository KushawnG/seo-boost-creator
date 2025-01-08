import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

interface CurrentPlanProps {
  subscription: Subscription | undefined;
}

export const CurrentPlan = ({ subscription }: CurrentPlanProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
      <p className="text-2xl font-bold text-primary capitalize">
        {subscription?.plan_type || 'Free'} Plan
      </p>
    </div>
  );
};