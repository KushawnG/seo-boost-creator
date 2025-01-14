import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', // .mp3
  'audio/wav',  // .wav
  'audio/x-m4a', // .m4a
  'audio/aac',  // .aac
  'audio/ogg'   // .ogg
];

const ALLOWED_FILE_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];

export const AnalysisForm = () => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  const validateFile = (file: File) => {
    if (!file) return false;

    // Check file extension
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidExtension = ALLOWED_FILE_EXTENSIONS.includes(fileExtension);
    
    // Check MIME type
    const isValidMimeType = ALLOWED_AUDIO_TYPES.includes(file.type);

    console.log('File validation:', {
      name: file.name,
      type: file.type,
      extension: fileExtension,
      isValidExtension,
      isValidMimeType
    });

    if (!isValidExtension && !isValidMimeType) {
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

    return true;
  };

  const analyzeUrl = async () => {
    if (!url) return;

    try {
      setIsLoading(true);
      console.log('Starting URL analysis:', url);

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

      console.log('Created analysis record:', analysis);

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke('analyze-song', {
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
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file || !validateFile(file)) return;

      setIsLoading(true);
      console.log('Starting file upload:', file.name);

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("User not authenticated");

      // Generate file path
      const filePath = `${user.user.id}/${crypto.randomUUID()}-${file.name}`;
      
      // Get the presigned URL for upload
      const { data: { signedUrl }, error: signedUrlError } = await supabase.storage
        .from('audio_files')
        .createSignedUploadUrl(filePath);

      if (signedUrlError) throw signedUrlError;

      // Create XHR request for upload with progress tracking
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentage = (event.loaded / event.total) * 100;
            setUploadProgress(Math.round(percentage));
            console.log(`Upload progress: ${percentage}%`);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

      console.log('File uploaded successfully');

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

      console.log('Created analysis record:', analysis);

      // Call the analyze-song function
      const { data, error: analysisError } = await supabase.functions.invoke('analyze-song', {
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
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
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

      {isLoading && uploadProgress > 0 && (
        <div className="space-y-2">
          <Progress value={uploadProgress} className="w-full" />
          <p className="text-sm text-gray-500 text-center">{uploadProgress}% uploaded</p>
        </div>
      )}
    </div>
  );
};