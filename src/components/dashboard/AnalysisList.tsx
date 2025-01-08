import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Analysis = Database['public']['Tables']['song_analysis']['Row'];

interface AnalysisListProps {
  showAll?: boolean;
}

export const AnalysisList = ({ showAll = false }: AnalysisListProps) => {
  const { toast } = useToast();

  const { data: analyses, isLoading } = useQuery({
    queryKey: ['analyses', { showAll }],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      let query = supabase
        .from('song_analysis')
        .select('*')
        .eq('user_id', user.user.id)
        .order('created_at', { ascending: false });

      if (!showAll) {
        query = query.limit(5);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Analysis[];
    }
  });

  if (isLoading) {
    return <div>Loading analyses...</div>;
  }

  if (!analyses?.length) {
    return <div>No analyses found. Try analyzing a song!</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>BPM</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {analyses.map((analysis) => (
          <TableRow key={analysis.id}>
            <TableCell>{analysis.title}</TableCell>
            <TableCell>{analysis.key || 'N/A'}</TableCell>
            <TableCell>{analysis.bpm || 'N/A'}</TableCell>
            <TableCell>
              <Badge variant={analysis.status === 'completed' ? 'default' : 'secondary'}>
                {analysis.status}
              </Badge>
            </TableCell>
            <TableCell>
              {new Date(analysis.created_at).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};