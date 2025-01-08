import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

type Analysis = Database['public']['Tables']['song_analysis']['Row'];

export const AnalysisList = () => {
  const { toast } = useToast();

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['analyses'],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from('song_analysis')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Analysis[];
    }
  });

  useEffect(() => {
    const channel = supabase
      .channel('song_analysis_updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'song_analysis',
      }, (payload) => {
        if (payload.new.status === 'completed') {
          toast({
            title: "Analysis Complete",
            description: `Analysis for "${payload.new.title}" is ready.`
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-4">
      {analyses?.map((analysis) => (
        <Card key={analysis.id}>
          <CardHeader>
            <CardTitle>{analysis.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="font-semibold">Status</div>
                <div className="capitalize">{analysis.status}</div>
              </div>
              <div>
                <div className="font-semibold">Key</div>
                <div>{analysis.key || 'Analyzing...'}</div>
              </div>
              <div>
                <div className="font-semibold">BPM</div>
                <div>{analysis.bpm || 'Analyzing...'}</div>
              </div>
              <div>
                <div className="font-semibold">Chords</div>
                <div>{analysis.chords?.join(', ') || 'Analyzing...'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};