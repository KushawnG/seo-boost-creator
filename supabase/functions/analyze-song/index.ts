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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url, filePath } = await req.json()
    const apiKey = Deno.env.get('FADR_API_KEY')
    if (!apiKey) throw new Error('FADR_API_KEY not found')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Supabase credentials not found')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // If filePath is provided, get the file from Supabase storage
    let audioFile: ArrayBuffer | null = null
    if (filePath) {
      const { data, error } = await supabase.storage
        .from('audio_files')
        .download(filePath)
      
      if (error) throw error
      audioFile = await data.arrayBuffer()
    }

    // Create presigned URL for upload
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

    if (!uploadResponse.ok) throw new Error('Failed to get upload URL')
    const { url: uploadUrl, s3Path } = await uploadResponse.json()

    // Upload the file
    if (audioFile) {
      const uploadFileResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'audio/mp3',
        },
        body: audioFile,
      })
      if (!uploadFileResponse.ok) throw new Error('Failed to upload file')
    }

    // Create asset
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

    if (!createAssetResponse.ok) throw new Error('Failed to create asset')
    const { asset } = await createAssetResponse.json()

    // Create stem task
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

    if (!createTaskResponse.ok) throw new Error('Failed to create task')
    const initialTaskResponse: FadrResponse = await createTaskResponse.json()

    // Poll for task completion
    let taskComplete = false
    let attempts = 0
    let finalResponse: FadrResponse | null = null

    while (!taskComplete && attempts < 12) { // Max 1 minute waiting time
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds between polls
      
      const taskStatusResponse = await fetch(`https://api.fadr.com/tasks/${initialTaskResponse.task._id}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!taskStatusResponse.ok) throw new Error('Failed to check task status')
      finalResponse = await taskStatusResponse.json()
      
      if (finalResponse.task.status.complete) {
        taskComplete = true
      }
      
      attempts++
    }

    if (!finalResponse || !taskComplete) {
      throw new Error('Analysis timed out')
    }

    // Return the analysis results
    return new Response(
      JSON.stringify({
        key: finalResponse.asset.metaData?.key || 'Unknown',
        bpm: finalResponse.asset.metaData?.tempo || 0,
        chords: finalResponse.asset.stems || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})