import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const AnalysisForm = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
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

      // Call edge function
      const { error: analysisError } = await supabase.functions.invoke('analyze-song', {
        body: { url, analysis_id: analysis.id }
      });

      if (analysisError) throw analysisError;

      toast({
        title: "Analysis Started",
        description: "We'll notify you when the analysis is complete."
      });

      setUrl("");
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsLoading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

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

      // Call edge function
      const { error: analysisError } = await supabase.functions.invoke('analyze-song', {
        body: { file_path: filePath, analysis_id: analysis.id }
      });

      if (analysisError) throw analysisError;

      toast({
        title: "Analysis Started",
        description: "We'll notify you when the analysis is complete."
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        placeholder="Enter YouTube URL..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isLoading}
      />
      
      <div className="flex items-center justify-center">
        <div className="border-t flex-grow"></div>
        <span className="px-4 text-gray-500">OR</span>
        <div className="border-t flex-grow"></div>
      </div>
      
      <Button
        variant="outline"
        className="w-full"
        disabled={isLoading}
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        Upload Audio File
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept="audio/*"
          onChange={handleFileUpload}
          disabled={isLoading}
        />
      </Button>
      
      <Button 
        className="w-full"
        onClick={handleAnalyze}
        disabled={isLoading || !url}
      >
        Analyze
      </Button>
    </div>
  );
};