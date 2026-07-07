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
  const cancelScheduled = !!subscription?.cancel_at_period_end;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
      <p className="text-2xl font-bold text-primary capitalize mb-2">
        {subscription?.plan_type || 'Free'} Plan
      </p>
      {cancelScheduled && renewalDate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your subscription is canceled and will end on <span className="font-semibold">{renewalDate}</span>.
          You keep your current plan until then, after which you'll move to the Free plan.
          No further charges will be made.
        </div>
      ) : renewalDate ? (
        <p className="text-sm text-gray-600">
          Renews on {renewalDate}
        </p>
      ) : null}
    </div>
  );
};
