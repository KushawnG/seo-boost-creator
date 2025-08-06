-- Create song_analysis table for tracking analysis requests
CREATE TABLE public.song_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT,
  file_path TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  key TEXT,
  bpm INTEGER,
  chords TEXT[],
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT either_url_or_file_path CHECK (
    (url IS NOT NULL AND file_path IS NULL) OR 
    (url IS NULL AND file_path IS NOT NULL)
  )
);

-- Enable Row Level Security
ALTER TABLE public.song_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own analyses" 
ON public.song_analysis 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own analyses" 
ON public.song_analysis 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses" 
ON public.song_analysis 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses" 
ON public.song_analysis 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_song_analysis_updated_at
  BEFORE UPDATE ON public.song_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for audio files if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('audio_files', 'audio_files', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for audio files
CREATE POLICY "Users can upload their own audio files"
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own audio files"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own audio files"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'audio_files' AND auth.uid()::text = (storage.foldername(name))[1]);