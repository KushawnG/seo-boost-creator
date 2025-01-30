import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { analyzeAudio } from './klangio-service.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
}

const createErrorResponse = (error: Error, status = 500) => {
  console.error('Error details:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause
  });
  
  return new Response(
    JSON.stringify({
      error: error.name || 'Error',
      details: error.message,
      timestamp: new Date().toISOString()
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status
    }
  );
};

serve(async (req) => {
  const startTime = Date.now();
  console.log('Starting analyze-song function');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, filePath } = await req.json();
    console.log('Received request:', { url, filePath });

    const apiKey = Deno.env.get('KLANGIO_API_KEY');
    if (!apiKey) {
      console.error('Klangio API key not configured');
      return createErrorResponse(new Error('Klangio API key not configured'), 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return createErrorResponse(new Error('Supabase credentials not configured'), 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    let audioData: Blob;

    if (filePath) {
      console.log('Downloading file from storage:', filePath);
      const { data, error: downloadError } = await supabase.storage
        .from('audio_files')
        .download(filePath);

      if (downloadError) {
        console.error('Download error:', downloadError);
        return createErrorResponse(new Error(`Failed to download file: ${downloadError.message}`), 400);
      }

      if (!data) {
        console.error('No file data received from storage');
        return createErrorResponse(new Error('No file data received from storage'), 400);
      }

      audioData = data;
    } else if (url) {
      console.log('Downloading file from URL:', url);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error('URL fetch error:', response.statusText);
          return createErrorResponse(new Error(`Failed to fetch URL: ${response.statusText}`), 400);
        }
        audioData = await response.blob();
      } catch (fetchError) {
        console.error('URL fetch error:', fetchError);
        return createErrorResponse(fetchError, 400);
      }
    } else {
      console.error('No URL or file path provided');
      return createErrorResponse(new Error('Either URL or file path must be provided'), 400);
    }

    try {
      console.log('Starting audio analysis with Klangio');
      const analysisData = await analyzeAudio(apiKey, audioData);
      
      const executionTime = Date.now() - startTime;
      console.log(`Total execution time: ${executionTime}ms`);

      return new Response(JSON.stringify(analysisData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (analysisError) {
      console.error('Klangio API error:', analysisError);
      return createErrorResponse(new Error(`Klangio API error: ${analysisError.message}`), 500);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(error, 500);
  }
});