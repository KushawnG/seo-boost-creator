import { Progress } from "@/components/ui/progress";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

interface CreditsProgressProps {
  subscription: Subscription | undefined;
  creditsTotal: number;
  creditsPercent: number;
}

export const CreditsProgress = ({
  subscription,
  creditsTotal,
  creditsPercent,
}: CreditsProgressProps) => {
  const formatRenewalDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Credits</h3>
      <div className="space-y-2">
        <Progress value={creditsPercent} />
        <p className="text-sm text-gray-600">
          {subscription?.credits_remaining || 0} analyses remaining out of {creditsTotal}
        </p>
        {subscription?.current_period_end && (
          <p className="text-sm text-gray-600">
            Credits renew on {formatRenewalDate(subscription.current_period_end)}
          </p>
        )}
      </div>
    </div>
  );
};