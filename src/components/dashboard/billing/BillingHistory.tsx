import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

export interface InvoiceInfo {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: string | null;
  url: string | null;
}

interface BillingHistoryProps {
  invoices: InvoiceInfo[] | undefined;
  isLoading: boolean;
}

const formatAmount = (cents: number, currency: string) =>
  `$${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;

export const BillingHistory = ({ invoices, isLoading }: BillingHistoryProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Billing History</h3>

      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading invoices...
        </div>
      ) : invoices && invoices.length > 0 ? (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex items-center justify-between gap-4 p-4 border rounded-lg">
              <div className="min-w-0">
                <p className="font-medium truncate">{invoice.description}</p>
                <p className="text-sm text-gray-600">
                  {format(new Date(invoice.date), 'MMMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                  {invoice.status}
                </Badge>
                <span className="font-medium">{formatAmount(invoice.amount, invoice.currency)}</span>
                {invoice.url && (
                  <a
                    href={invoice.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-500 hover:text-gray-900"
                    title="View invoice"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No invoices yet. Your receipts will appear here after your first payment.
        </p>
      )}
    </div>
  );
};
