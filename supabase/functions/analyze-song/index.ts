import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { analyzeAudio } from './klangio-service.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
}

const createErrorResponse = (error: Error, status = 500) => {
  const errorDetails = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause
  };
  
  console.error('Error details:', JSON.stringify(errorDetails, null, 2));
  
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
    const supabaseKey = Deno.env.get('SUPABASE_KEY');
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
        console.error('Download error:', {
          message: downloadError.message,
          details: downloadError,
          filePath
        });
        return createErrorResponse(new Error(`Failed to download file: ${downloadError.message}`), 400);
      }

      if (!data) {
        console.error('No file data received from storage:', { filePath });
        return createErrorResponse(new Error('No file data received from storage'), 400);
      }

      // Log file details
      console.log('File downloaded successfully:', {
        size: data.size,
        type: data.type,
        filePath
      });

      audioData = data;
    } else if (url) {
      console.log('Downloading file from URL:', url);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error('URL fetch error:', {
            status: response.status,
            statusText: response.statusText,
            url
          });
          return createErrorResponse(new Error(`Failed to fetch URL: ${response.statusText}`), 400);
        }
        audioData = await response.blob();
        console.log('URL file downloaded successfully:', {
          size: audioData.size,
          type: audioData.type,
          url
        });
      } catch (fetchError) {
        console.error('URL fetch error:', {
          error: fetchError,
          url
        });
        return createErrorResponse(fetchError, 400);
      }
    } else {
      console.error('No URL or file path provided');
      return createErrorResponse(new Error('Either URL or file path must be provided'), 400);
    }

    try {
      console.log('Starting audio analysis with Klangio:', {
        fileSize: audioData.size,
        fileType: audioData.type
      });
      
      const analysisData = await analyzeAudio(apiKey, audioData);
      
      const executionTime = Date.now() - startTime;
      console.log('Analysis completed successfully:', {
        executionTime,
        results: analysisData
      });

      return new Response(JSON.stringify(analysisData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (analysisError) {
      console.error('Klangio API error:', {
        error: analysisError,
        message: analysisError.message,
        stack: analysisError.stack,
        fileSize: audioData.size,
        fileType: audioData.type
      });
      return createErrorResponse(new Error(`Klangio API error: ${analysisError.message}`), 500);
    }
  } catch (error) {
    console.error('Unexpected error:', {
      error,
      message: error.message,
      stack: error.stack
    });
    return createErrorResponse(error, 500);
  }
});
