import { Button } from "@/components/ui/button";
import { CreditCard, Trash2 } from "lucide-react";
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

type PaymentMethod = Database['public']['Tables']['payment_methods']['Row']

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethod[] | undefined;
  onRemovePaymentMethod: (paymentMethodId: string) => Promise<void>;
}

export const PaymentMethodsList = ({
  paymentMethods,
  onRemovePaymentMethod,
}: PaymentMethodsListProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
      {paymentMethods?.map((method) => (
        <div key={method.id} className="flex items-center gap-4 p-4 border rounded-lg mb-4">
          <CreditCard className="h-6 w-6" />
          <div>
            <p className="font-medium">•••• {method.card_last4}</p>
            <p className="text-sm text-gray-600">
              Expires {method.card_exp_month}/{method.card_exp_year}
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="ml-auto">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Payment Method</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to remove this payment method? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRemovePaymentMethod(method.id)}>
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
      <Button className="w-full mt-4">Add Payment Method</Button>
    </div>
  );
};