import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FadrResponse {
  asset: {
    metaData?: {
      key?: string;
      tempo?: number;
    };
    stems?: string[];
  };
  task: {
    status: {
      complete: boolean;
    };
  };
}

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
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not found')
      return new Response(
        JSON.stringify({ error: 'Service configuration missing' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
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
        return new Response(
          JSON.stringify({ error: 'Failed to download file' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
      audioFile = await data.arrayBuffer()
    }

    // Create presigned URL for upload
    console.log('Requesting upload URL from FADR')
    const uploadResponse = await fetch('https://api.fadr.com/assets/upload2', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: filePath ? filePath.split('/').pop() : url.split('/').pop(),
        extension: 'mp3',
      }),
    })

    if (!uploadResponse.ok) {
      console.error('Failed to get upload URL:', await uploadResponse.text())
      return new Response(
        JSON.stringify({ error: 'Failed to get upload URL' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { url: uploadUrl, s3Path } = await uploadResponse.json()

    // Upload the file if we have one
    if (audioFile) {
      console.log('Uploading file to FADR')
      const uploadFileResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mp3',
        },
        body: audioFile,
      })
      if (!uploadFileResponse.ok) {
        console.error('Failed to upload file:', await uploadFileResponse.text())
        return new Response(
          JSON.stringify({ error: 'Failed to upload file' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Create asset
    console.log('Creating FADR asset')
    const createAssetResponse = await fetch('https://api.fadr.com/assets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: filePath ? filePath.split('/').pop() : url.split('/').pop(),
        extension: 'mp3',
        group: 'song-analysis',
        s3Path,
      }),
    })

    if (!createAssetResponse.ok) {
      console.error('Failed to create asset:', await createAssetResponse.text())
      return new Response(
        JSON.stringify({ error: 'Failed to create asset' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { asset } = await createAssetResponse.json()

    // Create stem task
    console.log('Creating analysis task')
    const createTaskResponse = await fetch('https://api.fadr.com/assets/analyze/stem', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        _id: asset._id,
      }),
    })

    if (!createTaskResponse.ok) {
      console.error('Failed to create task:', await createTaskResponse.text())
      return new Response(
        JSON.stringify({ error: 'Failed to create task' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const initialTaskResponse: FadrResponse = await createTaskResponse.json()

    // Poll for task completion
    let taskComplete = false
    let attempts = 0
    let finalResponse: FadrResponse | null = null

    console.log('Polling for task completion')
    while (!taskComplete && attempts < 12) { // Max 1 minute waiting time
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds between polls
      
      const taskStatusResponse = await fetch(`https://api.fadr.com/tasks/${initialTaskResponse.task._id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!taskStatusResponse.ok) {
        console.error('Failed to check task status:', await taskStatusResponse.text())
        return new Response(
          JSON.stringify({ error: 'Failed to check task status' }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      finalResponse = await taskStatusResponse.json()
      
      if (finalResponse.task.status.complete) {
        taskComplete = true
      }
      
      attempts++
    }

    if (!finalResponse || !taskComplete) {
      console.error('Analysis timed out')
      return new Response(
        JSON.stringify({ error: 'Analysis timed out' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Analysis complete, returning results')
    // Return the analysis results
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
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})