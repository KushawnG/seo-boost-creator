import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";

export interface PaymentMethodInfo {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

interface PaymentMethodsListProps {
  paymentMethods: PaymentMethodInfo[] | undefined;
  isLoading: boolean;
  canManage: boolean;
  onManage: () => void;
  isOpeningPortal: boolean;
}

export const PaymentMethodsList = ({
  paymentMethods,
  isLoading,
  canManage,
  onManage,
  isOpeningPortal,
}: PaymentMethodsListProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payment methods...
        </div>
      ) : paymentMethods && paymentMethods.length > 0 ? (
        paymentMethods.map((method) => (
          <div key={method.id} className="flex items-center gap-4 p-4 border rounded-lg mb-3">
            <CreditCard className="h-6 w-6 text-muted-foreground" />
            <div>
              <p className="font-medium">
                <span className="capitalize">{method.brand}</span> •••• {method.last4}
              </p>
              <p className="text-sm text-muted-foreground">
                Expires {String(method.expMonth).padStart(2, '0')}/{method.expYear}
              </p>
            </div>
            {method.isDefault && (
              <Badge variant="outline" className="ml-auto">Default</Badge>
            )}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground mb-3">
          No payment methods on file. One is added automatically when you subscribe to a paid plan.
        </p>
      )}

      {canManage && (
        <Button
          variant="outline"
          className="mt-2 gap-2"
          onClick={onManage}
          disabled={isOpeningPortal}
        >
          {isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Manage payment methods
        </Button>
      )}
    </div>
  );
};
