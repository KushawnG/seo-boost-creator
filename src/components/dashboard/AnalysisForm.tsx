import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { extractYouTubeId } from "@/lib/youtube";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_DURATION = 5; // seconds, Klangio API requirement
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',  // .mp3
  'audio/wav',   // .wav
  'audio/x-m4a', // .m4a
  'audio/mp4',   // .m4a on some browsers
  'audio/aac',   // .aac
  'audio/ogg'    // .ogg
] as const;

const ALLOWED_FILE_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'] as const;

export const AnalysisForm = () => {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pollTimer = useRef<number | null>(null);

  // Pick up a URL the visitor entered on the landing page before logging in
  useEffect(() => {
    const pending = localStorage.getItem('pendingAnalysis');
    if (pending) {
      setUrl(pending);
      localStorage.removeItem('pendingAnalysis');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, []);

  const pollAnalysis = async (analysisId: string) => {
    const { data, error } = await supabase
      .from('song_analysis')
      .select('id, status, error_message')
      .eq('id', analysisId)
      .single();

    if (error) {
      console.error('Polling error:', error);
    }

    if (data?.status === 'completed') {
      setActiveAnalysisId(null);
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['recent-analyses'] });
      toast({
        title: "Analysis Complete",
        description: "Opening your chord sheet...",
      });
      navigate(`/dashboard/analysis/${analysisId}`);
      return;
    }

    if (data?.status === 'failed') {
      setActiveAnalysisId(null);
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: ['analyses'] });
      queryClient.invalidateQueries({ queryKey: ['recent-analyses'] });
      toast({
        title: "Analysis Failed",
        description: data.error_message || 'Something went wrong analyzing this song.',
        variant: "destructive",
      });
      return;
    }

    pollTimer.current = window.setTimeout(() => pollAnalysis(analysisId), 3000);
  };

  const startAnalysis = async (analysisId: string) => {
    setActiveAnalysisId(analysisId);
    queryClient.invalidateQueries({ queryKey: ['recent-analyses'] });

    const { data, error } = await supabase.functions.invoke('analyze-song', {
      body: { analysisId }
    });

    if (error || (data && data.success === false)) {
      const message = data?.error || error?.message || 'Could not start analysis';
      setActiveAnalysisId(null);
      setIsSubmitting(false);
      // Don't leave the record stuck in "pending" if the function never started
      await supabase
        .from('song_analysis')
        .update({ status: 'failed', error_message: message })
        .eq('id', analysisId)
        .eq('status', 'pending');
      toast({
        title: "Analysis Failed",
        description: message,
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ['recent-analyses'] });
      return;
    }

    pollTimer.current = window.setTimeout(() => pollAnalysis(analysisId), 3000);
  };

  const analyzeUrl = async () => {
    if (!url) return;

    const videoId = extractYouTubeId(url.trim());
    if (!videoId) {
      toast({
        title: "Invalid Link",
        description: "Please paste a valid YouTube link (youtube.com or youtu.be).",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      const { data: analysis, error: insertError } = await supabase
        .from('song_analysis')
        .insert({
          url: url.trim(),
          youtube_id: videoId,
          title: 'YouTube song (fetching title...)',
          status: 'pending',
          user_id: user.user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setUrl("");
      await startAnalysis(analysis.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('Analysis error:', error);
      setIsSubmitting(false);
      toast({
        title: "Analysis Failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const validateFile = async (file: File): Promise<boolean> => {
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidExtension = ALLOWED_FILE_EXTENSIONS.includes(fileExtension as typeof ALLOWED_FILE_EXTENSIONS[number]);
    const isValidMimeType = ALLOWED_AUDIO_TYPES.includes(file.type as typeof ALLOWED_AUDIO_TYPES[number]);

    if (!isValidExtension && !isValidMimeType) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an audio file (MP3, WAV, M4A, AAC, or OGG)",
        variant: "destructive",
      });
      return false;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 50MB",
        variant: "destructive",
      });
      return false;
    }

    try {
      const duration = await getAudioDuration(file);
      if (duration < MIN_DURATION) {
        toast({
          title: "File Too Short",
          description: "Audio file must be longer than 5 seconds",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error('Error checking audio duration:', error);
      toast({
        title: "Invalid Audio File",
        description: "Could not verify audio duration. The file may be corrupted.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        audio.remove();
      };

      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration;
        cleanup();
        resolve(duration);
      });

      audio.addEventListener('error', () => {
        cleanup();
        reject(new Error('Could not load audio file'));
      });

      audio.src = objectUrl;
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let filePath: string | null = null;

    try {
      const isValid = await validateFile(file);
      if (!isValid) return;

      setIsSubmitting(true);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      filePath = `${user.user.id}/${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('audio_files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

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

      await startAnalysis(analysis.id);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('Upload/analysis error:', error);
      setIsSubmitting(false);
      toast({
        title: "Process Failed",
        description: message,
        variant: "destructive",
      });

      if (filePath) {
        await supabase.storage.from('audio_files').remove([filePath]);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          type="text"
          placeholder="Paste a YouTube link (e.g. https://youtube.com/watch?v=...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isSubmitting}
        />
        <Button onClick={analyzeUrl} disabled={!url || isSubmitting}>
          {isSubmitting ? "Analyzing..." : "Analyze"}
        </Button>
      </div>

      <div className="flex items-center">
        <div className="border-t flex-grow"></div>
        <span className="px-4 text-sm text-gray-500">OR</span>
        <div className="border-t flex-grow"></div>
      </div>

      <div>
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={isSubmitting}
          onClick={() => document.getElementById("dashboard-file-upload")?.click()}
        >
          <Upload className="h-4 w-4" />
          {isSubmitting ? "Processing..." : "Upload an audio file (MP3, WAV, M4A, AAC, OGG)"}
        </Button>
        <input
          id="dashboard-file-upload"
          type="file"
          className="hidden"
          accept={ALLOWED_AUDIO_TYPES.join(',')}
          onChange={handleFileUpload}
          disabled={isSubmitting}
        />
      </div>

      {isSubmitting && activeAnalysisId && (
        <div className="flex items-center gap-3 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing your song — detecting beats, key and chords. This usually takes about a minute.
        </div>
      )}
    </div>
  );
};
