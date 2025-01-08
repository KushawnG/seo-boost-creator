import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const Hero = () => {
  const [url, setUrl] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const handleAnalyze = async () => {
    if (url) {
      localStorage.setItem('pendingAnalysis', url);
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }
    
    navigate("/dashboard");
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file extension
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an audio file (MP3, WAV, M4A, AAC, or OGG)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast({
        title: "File Too Large",
        description: "Please upload a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    localStorage.setItem('pendingAnalysisFile', file.name);
    handleAnalyze();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div className="space-y-6 max-w-3xl">
        <div className="flex justify-center mb-6 cursor-pointer" onClick={scrollToTop}>
          <img
            src="Chord-Finder-Ai-Logo-Icon-Only.png"
            alt="Chord Finder AI"
            className="h-16 w-16"
          />
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight">
          Chord Finder AI
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Find the key, bpm and chords of any song.
        </p>
        <p className="text-gray-500">
          Enter the YouTube URL or input the Audio File of the song to Analyze.
        </p>
        
        <div className="space-y-4 w-full max-w-md mx-auto">
          <Input
            type="text"
            placeholder="Enter YouTube URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full"
          />
          
          <div className="flex items-center justify-center">
            <div className="border-t flex-grow"></div>
            <span className="px-4 text-gray-500">OR</span>
            <div className="border-t flex-grow"></div>
          </div>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              document.getElementById("file-upload")?.click();
            }}
          >
            Click to upload a file
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept="audio/mp3,audio/wav,audio/m4a,audio/aac,audio/ogg"
              onChange={handleFileUpload}
            />
          </Button>
          
          <Button 
            className="w-full"
            onClick={handleAnalyze}
          >
            Analyze
          </Button>
        </div>
      </div>
    </div>
  );
};