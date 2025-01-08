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
    console.log('Starting analyze-song function')
    const { url, filePath } = await req.json()
    console.log('Received request with:', { url, filePath })

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
        return new Response(
          JSON.stringify({ error: 'Failed to download file from storage', details: error }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      audioFile = await data.arrayBuffer()
    }

    if (!url && !audioFile) {
      console.error('No URL or file provided')
      return new Response(
        JSON.stringify({ error: 'Either URL or file must be provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const fileName = filePath ? filePath.split('/').pop() : url?.split('/').pop() || 'unknown';
    console.log('Getting FADR upload URL for:', fileName)
    
    try {
      const { url: uploadUrl, s3Path } = await getFadrUploadUrl(apiKey, fileName)
      console.log('Got FADR upload URL')

      if (audioFile) {
        console.log('Uploading file to FADR')
        await uploadFileToFadr(uploadUrl, audioFile)
        console.log('File uploaded to FADR successfully')
      }

      console.log('Creating FADR asset')
      const { asset } = await createFadrAsset(apiKey, fileName, s3Path)
      console.log('FADR asset created:', asset)

      console.log('Creating analysis task')
      const initialTaskResponse = await createAnalysisTask(apiKey, asset._id)
      console.log('Analysis task created:', initialTaskResponse)

      console.log('Polling for task completion')
      const finalResponse = await pollTaskStatus(apiKey, initialTaskResponse.task._id!)
      console.log('Analysis complete, results:', finalResponse)

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
    } catch (fadrError) {
      console.error('FADR API error:', fadrError)
      return new Response(
        JSON.stringify({ error: 'FADR API error', details: fadrError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})