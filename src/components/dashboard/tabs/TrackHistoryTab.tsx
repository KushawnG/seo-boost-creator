import { Card, CardContent } from "@/components/ui/card";
import { AnalysisList } from "@/components/dashboard/AnalysisList";

export const TrackHistoryTab = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Track History</h2>
      <Card>
        <CardContent className="p-6">
          <AnalysisList showAll={true} />
        </CardContent>
      </Card>
    </div>
  );
};