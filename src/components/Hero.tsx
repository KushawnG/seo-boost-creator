import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music } from "lucide-react";
import { useState } from "react";

export const Hero = () => {
  const [url, setUrl] = useState("");
  
  const handleAnalyze = () => {
    // Handle analysis logic here
    console.log("Analyzing:", url);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div className="space-y-6 max-w-3xl">
        <div className="flex justify-center mb-6">
          <Music className="h-16 w-16 text-primary" />
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
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            Click to upload a file
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept="audio/*"
              onChange={(e) => console.log(e.target.files?.[0])}
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