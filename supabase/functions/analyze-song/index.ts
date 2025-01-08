import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { url, file_path, analysis_id } = await req.json()
    const fadrApiKey = Deno.env.get('FADR_API_KEY')

    if (!fadrApiKey) {
      throw new Error('FADR_API_KEY not set')
    }

    const headers = {
      'Authorization': `Bearer ${fadrApiKey}`,
      'Content-Type': 'application/json',
    }

    // If we have a file_path, we need to download it from storage first
    let audioFile
    if (file_path) {
      const { data, error } = await supabase.storage
        .from('audio_files')
        .download(file_path)
      
      if (error) throw error
      audioFile = data
    }

    // Create upload URL
    const uploadRes = await fetch('https://api.fadr.com/assets/upload2', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'song.mp3',
        extension: 'mp3'
      })
    })

    const { url: uploadUrl, s3Path } = await uploadRes.json()

    // Upload file
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/mp3'
      },
      body: audioFile || await fetch(url).then(res => res.blob())
    })

    // Create asset
    const assetRes = await fetch('https://api.fadr.com/assets', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: 'song.mp3',
        extension: 'mp3',
        group: 'song-analysis',
        s3Path
      })
    })

    const { asset } = await assetRes.json()

    // Create stem task
    const taskRes = await fetch('https://api.fadr.com/assets/analyze/stem', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        _id: asset._id
      })
    })

    const { task } = await taskRes.json()

    // Poll for results
    let analysisComplete = false
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max

    while (!analysisComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

      const statusRes = await fetch(`https://api.fadr.com/tasks/${task._id}`, {
        headers
      })

      const { task: updatedTask } = await statusRes.json()

      if (updatedTask.status.complete) {
        // Update the analysis record with the results
        const { error } = await supabase
          .from('song_analysis')
          .update({
            key: updatedTask.asset.metaData.key,
            bpm: updatedTask.asset.metaData.tempo,
            chords: updatedTask.asset.metaData.chords || [],
            status: 'completed'
          })
          .eq('id', analysis_id)

        if (error) throw error
        analysisComplete = true
      }

      attempts++
    }

    return new Response(
      JSON.stringify({ message: 'Analysis started' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})