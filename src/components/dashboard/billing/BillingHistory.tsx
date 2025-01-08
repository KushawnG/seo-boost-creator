import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

interface BillingHistoryProps {
  subscription: Subscription | undefined;
  onCancelSubscription: () => Promise<void>;
}

export const BillingHistory = ({
  subscription,
  onCancelSubscription,
}: BillingHistoryProps) => {
  const isPaidPlan = subscription?.plan_type === 'pro' || subscription?.plan_type === 'premium';

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Billing History</h3>
      {subscription && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 border rounded-lg">
            <div>
              <p className="font-medium capitalize">{subscription.plan_type} Plan</p>
              {isPaidPlan && subscription.current_period_end && (
                <p className="text-sm text-gray-600">
                  Next billing date: {new Date(subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-medium">
                {subscription.plan_type === 'pro' ? '$9/mo' : 
                 subscription.plan_type === 'premium' ? '$25/mo' : 'Free'}
              </p>
              {isPaidPlan && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-2">
                      Cancel Plan
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel your subscription? You'll be downgraded to the Free plan at the end of your current billing period.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                      <AlertDialogAction onClick={onCancelSubscription}>
                        Cancel Subscription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};