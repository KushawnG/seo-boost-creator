import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { 
  getFadrUploadUrl, 
  uploadFileToFadr, 
  createFadrAsset,
  waitForAssetUpload,
  createAnalysisTask,
  pollTaskStatus
} from './fadr-service.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
}

const TIMEOUT = 900000; // 15 minutes

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

    const apiKey = Deno.env.get('FADR_API_KEY');
    if (!apiKey) {
      console.error('FADR API key not configured');
      return createErrorResponse(new Error('FADR API key not configured'), 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not configured');
      return createErrorResponse(new Error('Supabase credentials not configured'), 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    let audioData: Blob;
    let fileName: string;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out - please try with a smaller file')), TIMEOUT);
    });

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
      fileName = filePath.split('/').pop() || 'unknown.mp3';
    } else if (url) {
      console.log('Downloading file from URL:', url);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.error('URL fetch error:', response.statusText);
          return createErrorResponse(new Error(`Failed to fetch URL: ${response.statusText}`), 400);
        }
        audioData = await response.blob();
        fileName = url.split('/').pop() || 'youtube-audio.mp3';
      } catch (fetchError) {
        console.error('URL fetch error:', fetchError);
        return createErrorResponse(fetchError, 400);
      }
    } else {
      console.error('No URL or file path provided');
      return createErrorResponse(new Error('Either URL or file path must be provided'), 400);
    }

    try {
      console.log('Getting FADR upload URL for:', fileName);
      const { url: uploadUrl, s3Path } = await getFadrUploadUrl(apiKey, fileName);
      
      console.log('Uploading file to FADR');
      await uploadFileToFadr(uploadUrl, audioData);
      
      console.log('Creating FADR asset');
      const { asset } = await createFadrAsset(apiKey, fileName, s3Path);
      if (!asset?._id) {
        console.error('Invalid asset response:', asset);
        return createErrorResponse(new Error('Failed to create asset: Invalid response'), 500);
      }

      console.log('Waiting for asset upload completion');
      const completedAsset = await Promise.race([
        waitForAssetUpload(apiKey, asset._id),
        timeoutPromise
      ]);
      console.log('Asset upload completed:', completedAsset);

      console.log('Creating analysis task');
      const taskResponse = await createAnalysisTask(apiKey, asset._id);
      if (!taskResponse?.task?._id) {
        console.error('Invalid task response:', taskResponse);
        return createErrorResponse(new Error('Failed to create analysis task: Invalid response'), 500);
      }

      console.log('Polling for task completion');
      const finalResponse = await Promise.race([
        pollTaskStatus(apiKey, taskResponse.task._id),
        timeoutPromise
      ]);
      
      console.log('Analysis complete:', finalResponse);

      if (!finalResponse?.asset?.metaData) {
        console.error('Invalid final response:', finalResponse);
        return createErrorResponse(new Error('Invalid response structure: missing metadata'), 500);
      }

      const analysisData = {
        key: finalResponse.asset.metaData.key || 'Unknown',
        bpm: finalResponse.asset.metaData.tempo || 0,
        chords: finalResponse.asset.stems || [],
      };

      const executionTime = Date.now() - startTime;
      console.log(`Total execution time: ${executionTime}ms`);

      return new Response(JSON.stringify(analysisData), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } catch (fadrError) {
      console.error('FADR API error:', fadrError);
      return createErrorResponse(new Error(`FADR API error: ${fadrError.message}`), 500);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return createErrorResponse(error, 500);
  }
});