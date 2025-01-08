import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Music, Zap, Clock, Lock } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type Subscription = Database['public']['Tables']['subscriptions']['Row']

interface PlanFeature {
  icon: typeof Music | typeof Clock | typeof Zap | typeof Lock;
  text: string;
}

interface PlanCardProps {
  title: string;
  price: string;
  features: PlanFeature[];
  footnote: string;
  priceId: string;
  isCurrentPlan: boolean;
  isLoading: boolean;
  onUpgrade: (priceId: string) => void;
}

export const PlanCard = ({
  title,
  price,
  features,
  footnote,
  priceId,
  isCurrentPlan,
  isLoading,
  onUpgrade,
}: PlanCardProps) => {
  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="font-semibold">{title}</h4>
        <p className="text-2xl font-bold my-2">{price}</p>
        <ul className="text-sm text-gray-600 space-y-2 mb-4">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <feature.icon className="h-4 w-4 text-primary mr-2" />
              {feature.text}
            </li>
          ))}
          <li className="text-sm text-gray-500">
            {footnote}
          </li>
        </ul>
        <Button 
          className="w-full"
          disabled={isCurrentPlan || isLoading}
          onClick={() => onUpgrade(priceId)}
        >
          {isCurrentPlan ? 'Current Plan' : `Upgrade to ${title}`}
        </Button>
      </CardContent>
    </Card>
  );
};