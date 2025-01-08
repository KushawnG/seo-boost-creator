import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const AnalysisForm = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const analyzeUrl = async () => {
    if (!url) return;

    try {
      setIsLoading(true);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      // Create analysis record
      const { data: analysis, error: insertError } = await supabase
        .from('song_analysis')
        .insert({
          url,
          title: url.split('/').pop() || 'Unknown',
          status: 'pending',
          user_id: user.user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke('analyze-song', {
        body: { url }
      });

      if (analysisError) throw analysisError;

      // Update the analysis record with results
      const { error: updateError } = await supabase
        .from('song_analysis')
        .update({
          key: data.key,
          bpm: data.bpm,
          chords: data.chords,
          status: 'completed'
        })
        .eq('id', analysis.id);

      if (updateError) throw updateError;

      toast({
        title: "Analysis Complete",
        description: "Your song has been successfully analyzed.",
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      setIsLoading(true);

      // Upload file to storage
      const filePath = `${user.user.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('audio_files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create analysis record
      const { data: analysis, error: insertError } = await supabase
        .from('song_analysis')
        .insert({
          file_path: filePath,
          title: file.name,
          status: 'pending',
          user_id: user.user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke('analyze-song', {
        body: { filePath }
      });

      if (analysisError) throw analysisError;

      // Update the analysis record with results
      const { error: updateError } = await supabase
        .from('song_analysis')
        .update({
          key: data.key,
          bpm: data.bpm,
          chords: data.chords,
          status: 'completed'
        })
        .eq('id', analysis.id);

      if (updateError) throw updateError;

      toast({
        title: "Analysis Complete",
        description: "Your song has been successfully analyzed.",
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input
          type="text"
          placeholder="Enter song URL (YouTube, SoundCloud, etc.)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
        />
        <Button onClick={analyzeUrl} disabled={!url || isLoading}>
          {isLoading ? "Analyzing..." : "Analyze URL"}
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <Input
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          disabled={isLoading}
        />
        <Button disabled={isLoading}>
          {isLoading ? "Uploading..." : "Upload File"}
        </Button>
      </div>
    </div>
  );
};