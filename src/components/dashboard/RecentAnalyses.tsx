import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Badge } from "@/components/ui/badge";

type Analysis = Database['public']['Tables']['song_analysis']['Row'];

export const RecentAnalyses = () => {
  const { data: analyses, isLoading } = useQuery({
    queryKey: ['recent-analyses'],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from('song_analysis')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false })
        .limit(2);

      if (error) throw error;
      return data as Analysis[];
    }
  });

  if (isLoading) {
    return <div>Loading recent analyses...</div>;
  }

  if (!analyses?.length) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Recent Analyses</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {analyses.map((analysis) => (
          <Card key={analysis.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold truncate">{analysis.title}</h3>
                <Badge variant={analysis.status === 'completed' ? 'default' : 'secondary'}>
                  {analysis.status}
                </Badge>
              </div>
              
              {analysis.status === 'completed' && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Key:</span>
                    <span className="font-medium">{analysis.key || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">BPM:</span>
                    <span className="font-medium">{analysis.bpm || 'N/A'}</span>
                  </div>
                  {analysis.chords && (
                    <div>
                      <span className="text-gray-600">Chords:</span>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {analysis.chords.map((chord, index) => (
                          <Badge key={index} variant="outline">{chord}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};