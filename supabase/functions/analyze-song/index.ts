import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
import { corsHeaders } from './cors.ts'
import { 
  getFadrUploadUrl, 
  uploadFileToFadr, 
  createFadrAsset,
  createAnalysisTask,
  pollTaskStatus
} from './fadr-service.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url, filePath } = await req.json()
    const apiKey = Deno.env.get('FADR_API_KEY')
    if (!apiKey) {
      console.error('FADR_API_KEY not found')
      throw new Error('API key not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not found')
      throw new Error('Service configuration missing')
    }

    console.log('Starting analysis with params:', { url, filePath })
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // If filePath is provided, get the file from Supabase storage
    let audioFile: ArrayBuffer | null = null
    if (filePath) {
      console.log('Downloading file from storage:', filePath)
      const { data, error } = await supabase.storage
        .from('audio_files')
        .download(filePath)
      
      if (error) {
        console.error('Storage download error:', error)
        throw new Error('Failed to download file')
      }
      audioFile = await data.arrayBuffer()
    }

    const fileName = filePath ? filePath.split('/').pop() : url.split('/').pop();
    const { url: uploadUrl, s3Path } = await getFadrUploadUrl(apiKey, fileName);

    // Upload the file if we have one
    if (audioFile) {
      await uploadFileToFadr(uploadUrl, audioFile);
    }

    const { asset } = await createFadrAsset(apiKey, fileName, s3Path);
    const initialTaskResponse = await createAnalysisTask(apiKey, asset._id);
    const finalResponse = await pollTaskStatus(apiKey, initialTaskResponse.task._id!);

    console.log('Analysis complete, returning results');
    return new Response(
      JSON.stringify({
        key: finalResponse.asset.metaData?.key || 'Unknown',
        bpm: finalResponse.asset.metaData?.tempo || 0,
        chords: finalResponse.asset.stems || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})