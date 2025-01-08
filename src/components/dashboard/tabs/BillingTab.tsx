import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

export const BillingTab = () => {
  // This is a placeholder until we implement Stripe
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Billing</h2>
      
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Payment Method</h3>
              <div className="flex items-center gap-4 p-4 border rounded-lg">
                <CreditCard className="h-6 w-6" />
                <div>
                  <p className="font-medium">•••• •••• •••• 4242</p>
                  <p className="text-sm text-gray-600">Expires 12/25</p>
                </div>
                <Button variant="outline" className="ml-auto">Edit</Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Billing History</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Pro Plan - Monthly</p>
                    <p className="text-sm text-gray-600">March 1, 2024</p>
                  </div>
                  <p className="font-medium">$9.99</p>
                </div>
                <div className="flex justify-between items-center p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Pro Plan - Monthly</p>
                    <p className="text-sm text-gray-600">February 1, 2024</p>
                  </div>
                  <p className="font-medium">$9.99</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};