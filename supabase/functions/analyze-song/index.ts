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
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, filePath } = await req.json();
    console.log('Received request:', { url, filePath });

    const apiKey = Deno.env.get('FADR_API_KEY');
    if (!apiKey) {
      throw new Error('FADR API key not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    let audioData: Blob;
    let fileName: string;

    if (filePath) {
      console.log('Downloading file from storage:', filePath);
      const { data, error: downloadError } = await supabase.storage
        .from('audio_files')
        .download(filePath);

      if (downloadError) {
        console.error('Download error:', downloadError);
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      if (!data) {
        throw new Error('No file data received from storage');
      }

      audioData = data;
      fileName = filePath.split('/').pop() || 'unknown.mp3';
    } else if (url) {
      console.log('Downloading file from URL:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.statusText}`);
      }
      audioData = await response.blob();
      fileName = url.split('/').pop() || 'youtube-audio.mp3';
    } else {
      throw new Error('Either URL or file path must be provided');
    }

    console.log('Getting FADR upload URL for:', fileName);
    const { url: uploadUrl, s3Path } = await getFadrUploadUrl(apiKey, fileName);
    
    console.log('Uploading file to FADR');
    await uploadFileToFadr(uploadUrl, audioData);
    
    console.log('Creating FADR asset');
    const { asset } = await createFadrAsset(apiKey, fileName, s3Path);
    if (!asset?._id) {
      throw new Error('Failed to create asset: Invalid response');
    }

    console.log('Waiting for asset upload completion');
    const completedAsset = await waitForAssetUpload(apiKey, asset._id);
    console.log('Asset upload completed:', completedAsset);

    console.log('Creating analysis task');
    const taskResponse = await createAnalysisTask(apiKey, asset._id);
    if (!taskResponse?.task?._id) {
      throw new Error('Failed to create analysis task: Invalid response');
    }

    console.log('Polling for task completion');
    const finalResponse = await pollTaskStatus(apiKey, taskResponse.task._id);
    console.log('Analysis complete:', finalResponse);

    if (!finalResponse?.asset?.metaData) {
      throw new Error('Invalid response structure: missing metadata');
    }

    const analysisData = {
      key: finalResponse.asset.metaData.key || 'Unknown',
      bpm: finalResponse.asset.metaData.tempo || 0,
      chords: finalResponse.asset.stems || [],
    };

    return new Response(JSON.stringify(analysisData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in analyze-song function:', error);
    return new Response(
      JSON.stringify({
        error: error.name || 'Error',
        details: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});