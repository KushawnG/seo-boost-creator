import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_DURATION = 5; // 5 seconds minimum as per Klangio API requirement
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',  // .mp3
  'audio/wav',   // .wav
  'audio/x-m4a', // .m4a
  'audio/aac',   // .aac
  'audio/ogg'    // .ogg
] as const;

const ALLOWED_FILE_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'] as const;

interface AnalysisRecord {
  id: string;
  url?: string;
  file_path?: string;
  title: string;
  status: 'pending' | 'completed' | 'failed';
  user_id: string;
  key?: string;
  bpm?: number;
  chords?: string[];
  error_message?: string;
}

interface AnalysisResult {
  key: string;
  bpm: number;
  chords: string[];
}

export const AnalysisForm = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const validateFile = async (file: File): Promise<boolean> => {
    if (!file) return false;

    // Check file extension
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidExtension = ALLOWED_FILE_EXTENSIONS.includes(fileExtension as typeof ALLOWED_FILE_EXTENSIONS[number]);
    
    // Check MIME type
    const isValidMimeType = ALLOWED_AUDIO_TYPES.includes(file.type as typeof ALLOWED_AUDIO_TYPES[number]);

    console.log('File validation:', {
      name: file.name,
      type: file.type,
      extension: fileExtension,
      size: file.size,
      isValidExtension,
      isValidMimeType
    });

    if (!isValidExtension || !isValidMimeType) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an audio file (MP3, WAV, M4A, AAC, or OGG)",
        variant: "destructive",
      });
      return false;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 50MB",
        variant: "destructive",
      });
      return false;
    }

    // Check audio duration
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

  const analyzeUrl = async () => {
    if (!url) return;

    let analysis: AnalysisRecord | null = null;

    try {
      setIsLoading(true);
      console.log('Starting URL analysis:', url);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      // Create analysis record
      const { data: analysisData, error: insertError } = await supabase
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
      analysis = analysisData;

      console.log('Created analysis record:', analysis);

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke<AnalysisResult>('analyze-song', {
        body: { url }
      });

      if (analysisError) throw analysisError;

      console.log('Analysis complete:', data);

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
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });

      // Update analysis record to failed state if it exists
      if (analysis?.id) {
        await supabase
          .from('song_analysis')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', analysis.id);
      }
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    let analysis: AnalysisRecord | null = null;
    let filePath: string | null = null;

    try {
      const isValid = await validateFile(file);
      if (!isValid) return;

      setIsLoading(true);
      console.log('Starting file upload:', file.name);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      // Generate file path
      filePath = `${user.user.id}/${crypto.randomUUID()}-${file.name}`;
      
      // Create analysis record first
      const { data: analysisData, error: insertError } = await supabase
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
      analysis = analysisData;

      console.log('Created analysis record:', analysis);
      
      // Upload file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from('audio_files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
          onUploadProgress: (progress) => {
            const percentage = (progress.loaded / progress.total) * 100;
            setUploadProgress(Math.round(percentage));
            console.log(`Upload progress: ${percentage}%`);
          }
        });

      if (uploadError) throw uploadError;

      console.log('File uploaded successfully');

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke<AnalysisResult>('analyze-song', {
        body: { filePath }
      });

      if (analysisError) throw analysisError;

      console.log('Analysis complete:', data);

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
    } catch (error: any) {
      console.error('Upload/analysis error:', error);
      toast({
        title: "Process Failed",
        description: error.message,
        variant: "destructive",
      });

      // Update analysis record to failed state if it exists
      if (analysis?.id) {
        await supabase
          .from('song_analysis')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', analysis.id);
      }

      // Clean up uploaded file if analysis failed
      if (filePath) {
        await supabase.storage
          .from('audio_files')
          .remove([filePath]);
      }
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      // Clear the file input
      event.target.value = '';
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
          accept={ALLOWED_AUDIO_TYPES.join(',')}
          onChange={handleFileUpload}
          disabled={isLoading}
        />
        <Button disabled={isLoading}>
          {isLoading ? "Processing..." : "Upload File"}
        </Button>
      </div>

      {isLoading && uploadProgress > 0 && (
        <div className="space-y-2">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-gray-500 text-center">{uploadProgress}% uploaded</p>
        </div>
      )}
    </div>
  );
};
