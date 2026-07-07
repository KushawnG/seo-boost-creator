import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { analyzeAudio } from './klangio.ts';
import { extractYouTubeId, fetchYouTubeAudio } from './youtube.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyzeRequest {
  analysisId: string;
}

interface AudioSource {
  blob: Blob;
  filename: string;
  title?: string;
  duration?: number;
  youtubeId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const klangioApiKey = Deno.env.get('KLANGIO_API_KEY');
    if (!klangioApiKey) {
      return jsonResponse({ success: false, error: 'Klangio API key not configured' }, 500);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Not authenticated' }, 401);
    }

    const { analysisId }: AnalyzeRequest = await req.json();
    if (!analysisId) {
      return jsonResponse({ success: false, error: 'analysisId is required' }, 400);
    }

    const { data: analysis, error: analysisError } = await supabase
      .from('song_analysis')
      .select('*')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single();

    if (analysisError || !analysis) {
      return jsonResponse({ success: false, error: 'Analysis not found' }, 404);
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('credits_remaining')
      .eq('user_id', user.id)
      .single();

    if (subscription && subscription.credits_remaining <= 0) {
      await markFailed(supabase, analysisId, 'No credits remaining. Please upgrade your plan.');
      return jsonResponse({ success: false, error: 'Insufficient credits' }, 402);
    }

    const processing = processAnalysis(supabase, klangioApiKey, user.id, analysis);

    // Klangio jobs take a while — finish in the background and let the client
    // watch the song_analysis row for the result.
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) {
      EdgeRuntime.waitUntil(processing);
      return jsonResponse({ success: true, status: 'processing' }, 202);
    }

    await processing;
    return jsonResponse({ success: true, status: 'completed' }, 200);
  } catch (error) {
    console.error('Unexpected error in analyze-song:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonResponse({ success: false, error: message }, 500);
  }
});

async function processAnalysis(
  supabase: SupabaseClient,
  klangioApiKey: string,
  userId: string,
  // deno-lint-ignore no-explicit-any
  analysis: any,
): Promise<void> {
  try {
    const source = await getAudioSource(supabase, analysis);

    // Surface video metadata right away so the dashboard shows a real title
    if (source.title || source.youtubeId) {
      await supabase
        .from('song_analysis')
        .update({
          ...(source.title ? { title: source.title } : {}),
          ...(source.youtubeId ? { youtube_id: source.youtubeId } : {}),
          ...(source.duration ? { duration: source.duration } : {}),
        })
        .eq('id', analysis.id);
    }

    console.log('Starting Klangio analysis:', {
      analysisId: analysis.id,
      bytes: source.blob.size,
      filename: source.filename,
    });

    const result = await analyzeAudio(klangioApiKey, source.blob, source.filename);

    const { error: updateError } = await supabase
      .from('song_analysis')
      .update({
        status: 'completed',
        key: result.key,
        bpm: result.bpm,
        time_signature: result.timeSignature,
        chords: result.chords,
        chords_timeline: result.chordsTimeline,
        beats: result.beats,
        error_message: null,
      })
      .eq('id', analysis.id);

    if (updateError) throw updateError;

    await deductCredit(supabase, userId);
    console.log('Analysis completed:', analysis.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('Analysis failed:', { analysisId: analysis.id, message });
    await markFailed(supabase, analysis.id, message);
  }
}

async function getAudioSource(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  analysis: any,
): Promise<AudioSource> {
  if (analysis.file_path) {
    const { data, error } = await supabase.storage
      .from('audio_files')
      .download(analysis.file_path);
    if (error || !data) {
      throw new Error(`Could not read uploaded file: ${error?.message ?? 'not found'}`);
    }
    const extension = analysis.file_path.split('.').pop()?.toLowerCase() || 'mp3';
    return { blob: data, filename: `audio.${extension}` };
  }

  if (analysis.url) {
    const youtubeId = extractYouTubeId(analysis.url);
    if (youtubeId) {
      const { blob, title, duration } = await fetchYouTubeAudio(youtubeId);
      return { blob, filename: 'audio.m4a', title, duration, youtubeId };
    }

    // Non-YouTube URLs must point directly at an audio file
    const response = await fetch(analysis.url);
    if (!response.ok) {
      throw new Error(`Could not download audio from URL (${response.status})`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('audio/')) {
      throw new Error(
        'This URL is not a YouTube link or a direct audio file. Please paste a YouTube link or upload the song file.',
      );
    }
    return { blob: await response.blob(), filename: 'audio.mp3' };
  }

  throw new Error('Analysis has no URL or uploaded file');
}

async function deductCredit(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('credits_remaining')
    .eq('user_id', userId)
    .single();

  if (!subscription) return;

  const { error } = await supabase
    .from('subscriptions')
    .update({ credits_remaining: Math.max(0, subscription.credits_remaining - 1) })
    .eq('user_id', userId);

  if (error) console.error('Failed to deduct credit:', error);
}

async function markFailed(
  supabase: SupabaseClient,
  analysisId: string,
  message: string,
): Promise<void> {
  await supabase
    .from('song_analysis')
    .update({ status: 'failed', error_message: message })
    .eq('id', analysisId);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
