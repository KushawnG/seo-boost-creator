import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FadrAnalysisRequest {
  audioUrl?: string;
  filePath?: string;
}

interface FadrAnalysisResponse {
  success: boolean;
  data?: {
    chords: Array<{
      time: number;
      chord: string;
      confidence: number;
    }>;
    key: string;
    tempo: number;
    timeSignature: string;
  };
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const fadrApiKey = Deno.env.get('FADR_API_KEY');
    if (!fadrApiKey) {
      throw new Error('FADR_API_KEY not configured');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid authentication');
    }

    const requestData: FadrAnalysisRequest = await req.json();
    console.log('FADR Analysis request:', requestData);

    // Check user credits
    const { data: subscription, error: subError } = await supabaseClient
      .from('subscriptions')
      .select('credits_remaining')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.credits_remaining <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient credits' }),
        { 
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let audioData: Blob;
    
    // Get audio file
    if (requestData.filePath) {
      // Download from Supabase Storage
      const { data, error: downloadError } = await supabaseClient.storage
        .from('audio_files')
        .download(requestData.filePath);

      if (downloadError || !data) {
        throw new Error(`Failed to download file: ${downloadError?.message}`);
      }
      audioData = data;
    } else if (requestData.audioUrl) {
      // Download from URL
      const response = await fetch(requestData.audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio from URL: ${response.statusText}`);
      }
      audioData = await response.blob();
    } else {
      throw new Error('Either filePath or audioUrl must be provided');
    }

    console.log('Audio file prepared for FADR analysis:', {
      size: audioData.size,
      type: audioData.type
    });

    // Prepare form data for FADR API
    const formData = new FormData();
    formData.append('audio', audioData, 'audio.mp3');
    formData.append('format', 'json');

    // Call FADR API for chord analysis
    const fadrResponse = await fetch('https://api.fadr.com/v1/analyze', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${fadrApiKey}`,
      },
      body: formData,
    });

    if (!fadrResponse.ok) {
      const errorText = await fadrResponse.text();
      console.error('FADR API error:', {
        status: fadrResponse.status,
        statusText: fadrResponse.statusText,
        error: errorText
      });
      throw new Error(`FADR API error: ${fadrResponse.statusText}`);
    }

    const fadrResult = await fadrResponse.json();
    console.log('FADR analysis result:', fadrResult);

    // Process FADR response into our format
    const analysisResult: FadrAnalysisResponse = {
      success: true,
      data: {
        chords: fadrResult.chords || [],
        key: fadrResult.key || 'Unknown',
        tempo: fadrResult.tempo || 120,
        timeSignature: fadrResult.time_signature || '4/4'
      }
    };

    // Deduct credit
    const { error: updateError } = await supabaseClient
      .from('subscriptions')
      .update({ 
        credits_remaining: subscription.credits_remaining - 1 
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to update credits:', updateError);
    }

    console.log('FADR analysis completed successfully');

    return new Response(
      JSON.stringify(analysisResult),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in FADR analysis function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});