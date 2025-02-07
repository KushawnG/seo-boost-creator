
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { analyzeAudio } from './klangio-service.ts';
import { corsHeaders } from './cors-config.ts';
import { createErrorResponse } from './error-utils.ts';
import { initSupabaseClient, downloadFromStorage, downloadFromUrl } from './supabase-client.ts';
import { AudioSource } from './types.ts';

serve(async (req) => {
  const startTime = Date.now();
  console.log('Starting analyze-song function');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, filePath }: AudioSource = await req.json();
    console.log('Received request:', { url, filePath });

    const apiKey = Deno.env.get('KLANGIO_API_KEY');
    if (!apiKey) {
      console.error('Klangio API key not configured');
      return createErrorResponse(new Error('Klangio API key not configured'), 500);
    }

    const supabase = initSupabaseClient();
    let audioData: Blob;

    if (filePath) {
      audioData = await downloadFromStorage(supabase, filePath);
    } else if (url) {
      audioData = await downloadFromUrl(url);
    } else {
      console.error('No URL or file path provided');
      return createErrorResponse(new Error('Either URL or file path must be provided'), 400);
    }

    try {
      // Verify the blob is valid
      if (!audioData || audioData.size === 0) {
        throw new Error('Invalid audio data: Empty file');
      }

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
    } catch (analysisError: any) {
      console.error('Klangio API error:', {
        error: analysisError,
        message: analysisError.message,
        stack: analysisError.stack,
        fileDetails: {
          size: audioData.size,
          type: audioData.type
        }
      });
      return createErrorResponse(new Error(`Klangio API error: ${analysisError.message}`), 500);
    }
  } catch (error: any) {
    console.error('Unexpected error:', {
      error,
      message: error.message,
      stack: error.stack
    });
    return createErrorResponse(error, 500);
  }
});
