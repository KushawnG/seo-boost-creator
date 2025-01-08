import { Card, CardContent } from "@/components/ui/card";
import { AnalysisForm } from "@/components/dashboard/AnalysisForm";
import { RecentAnalyses } from "@/components/dashboard/RecentAnalyses";

export const HomeTab = () => {
  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-6">
          <h2 className="text-2xl font-bold mb-6">Analyze New Track</h2>
          <AnalysisForm />
        </CardContent>
      </Card>

      <RecentAnalyses />
    </div>
  );
};