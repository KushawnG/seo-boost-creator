import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from './cors.ts'
import { 
  getFadrUploadUrl, 
  uploadFileToFadr, 
  createFadrAsset,
  waitForAssetUpload,
  createAnalysisTask,
  pollTaskStatus
} from './fadr-service.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting analyze-song function');
    const { url, filePath } = await req.json();
    console.log('Received request with:', { url, filePath });

    const apiKey = Deno.env.get('FADR_API_KEY');
    if (!apiKey) {
      console.error('FADR_API_KEY not found');
      throw new Error('API key not configured');
    }

    // For now, we'll focus on file uploads
    if (!filePath) {
      throw new Error('File path is required');
    }

    const fileName = filePath.split('/').pop() || 'unknown';
    console.log('Processing file:', fileName);

    try {
      console.log('Getting FADR upload URL');
      const { url: uploadUrl, s3Path } = await getFadrUploadUrl(apiKey, fileName);
      console.log('Got FADR upload URL');

      if (audioFile) {
        console.log('Uploading file to FADR');
        await uploadFileToFadr(uploadUrl, audioFile);
        console.log('File uploaded to FADR successfully');
      }

      console.log('Creating FADR asset');
      const { asset } = await createFadrAsset(apiKey, fileName, s3Path);
      if (!asset || !asset._id) {
        console.error('Invalid asset response:', asset);
        throw new Error('Failed to create asset: Invalid response');
      }
      console.log('FADR asset created:', asset);

      // Wait for the asset upload to complete
      console.log('Waiting for asset upload to complete');
      const completedAsset = await waitForAssetUpload(apiKey, asset._id);
      console.log('Asset upload completed:', completedAsset);

      console.log('Creating analysis task');
      const initialTaskResponse = await createAnalysisTask(apiKey, asset._id);
      if (!initialTaskResponse.task?._id) {
        console.error('Invalid task response:', initialTaskResponse);
        throw new Error('Failed to create analysis task: Invalid response');
      }
      console.log('Analysis task created:', initialTaskResponse);

      console.log('Polling for task completion');
      const finalResponse = await pollTaskStatus(apiKey, initialTaskResponse.task._id);
      console.log('Analysis complete, results:', finalResponse);

      if (!finalResponse?.asset?.metaData) {
        console.error('Invalid final response:', finalResponse);
        throw new Error('Invalid response structure: missing metadata');
      }

      const analysisData = {
        key: finalResponse.asset.metaData.key || 'Unknown',
        bpm: finalResponse.asset.metaData.tempo || 0,
        chords: finalResponse.asset.stems || [],
      };

      console.log('Extracted analysis data:', analysisData);

      return new Response(
        JSON.stringify(analysisData),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    } catch (fadrError) {
      console.error('FADR API error:', fadrError);
      return new Response(
        JSON.stringify({ error: 'FADR API error', details: fadrError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});