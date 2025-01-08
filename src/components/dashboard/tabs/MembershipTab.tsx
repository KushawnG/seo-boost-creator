import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const MembershipTab = () => {
  // This is a placeholder until we implement Stripe
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Membership</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Current Plan</h3>
              <p className="text-2xl font-bold text-primary">Free Plan</p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-2">Credits</h3>
              <div className="space-y-2">
                <Progress value={60} />
                <p className="text-sm text-gray-600">3 credits remaining out of 5</p>
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
                    <Button className="w-full" disabled>Current Plan</Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-semibold">Enterprise Plan</h4>
                    <p className="text-2xl font-bold my-2">$29.99/mo</p>
                    <p className="text-sm text-gray-600 mb-4">Unlimited credits</p>
                    <Button className="w-full">Upgrade</Button>
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