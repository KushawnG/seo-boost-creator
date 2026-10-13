import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { analyzeAudio } from './klangio.ts';
import { chordsInOrder, cleanTimeline, mainProgression } from './progression.ts';
import { extractYouTubeId, fetchYouTubeAudio } from './youtube.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A background task gets ~150s of wall clock and then the worker is killed
// without running any catch block — measured, not guessed. Pulling a song off
// YouTube routinely takes 100s+ of that, which left too little for Klangio and
// stranded the row on 'pending' with no error for the 20 minutes it took the
// watchdog to notice. So extraction and transcription now run in SEPARATE
// invocations, each with the full budget to itself, with the audio handed
// between them through storage.
const STATUS = {
  pending: 'pending',
  extracted: 'extracted',
  completed: 'completed',
  failed: 'failed',
} as const;

interface AnalyzeRequest {
  analysisId: string;
}

interface StoredAudio {
  filename: string;
  /** Present when this invocation just downloaded it — saves a round trip. */
  blob?: Blob;
  /** False when the upload to storage failed and only `blob` is usable. */
  stored: boolean;
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

    // Second leg, called by the first (or by the watchdog): the audio is
    // already in storage, so this worker only has to transcribe it. The user
    // was authenticated and charged-checked on the way in, so this path
    // authenticates on the shared secret instead of a user token.
    const internalSecret = req.headers.get('x-internal-secret');
    if (internalSecret) {
      const expected = Deno.env.get('INTERNAL_FN_SECRET');
      if (!expected || internalSecret !== expected) {
        return jsonResponse({ success: false, error: 'Forbidden' }, 403);
      }

      const { analysisId }: AnalyzeRequest = await req.json();
      if (!analysisId) {
        return jsonResponse({ success: false, error: 'analysisId is required' }, 400);
      }

      const transcribing = processTranscription(supabase, klangioApiKey, analysisId);
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) {
        EdgeRuntime.waitUntil(transcribing);
        return jsonResponse({ success: true, status: 'transcribing' }, 202);
      }
      await transcribing;
      return jsonResponse({ success: true, status: 'completed' }, 200);
    }

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

    // Completed analyses are final — never reprocess (and re-charge) them
    if (analysis.status === STATUS.completed) {
      return jsonResponse({ success: true, status: 'completed' }, 200);
    }

    // Already extracted — this is a resume (the client noticed it stalled, or
    // the user hit retry). The audio is in hand, so go straight to Klangio and
    // don't re-run the credit checks: they passed on the first attempt.
    if (analysis.status === STATUS.extracted && analysis.file_path) {
      const resuming = processTranscription(supabase, klangioApiKey, analysisId);
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) {
        EdgeRuntime.waitUntil(resuming);
        return jsonResponse({ success: true, status: 'transcribing' }, 202);
      }
      await resuming;
      return jsonResponse({ success: true, status: 'completed' }, 200);
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('credits_remaining, plan_type')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.credits_remaining <= 0) {
      await markFailed(supabase, analysisId, 'No credits remaining. Please upgrade your plan.');
      return jsonResponse({ success: false, error: 'Insufficient credits' }, 402);
    }

    // Cap free-plan usage per network so credit farming with many emails
    // doesn't scale (paid plans are unaffected)
    const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;
    if (clientIp) {
      await supabase.from('song_analysis').update({ client_ip: clientIp }).eq('id', analysisId);

      if (subscription.plan_type === 'free') {
        const { data: ipCount } = await supabase.rpc('count_recent_free_ip_analyses', { p_ip: clientIp });
        if (typeof ipCount === 'number' && ipCount >= 9) {
          await markFailed(
            supabase,
            analysisId,
            'The free analysis limit for your network has been reached this month. Upgrade to Pro to keep analyzing songs.',
          );
          return jsonResponse({ success: false, error: 'Free network limit reached' }, 429);
        }
      }
    }

    const processing = processExtraction(supabase, klangioApiKey, analysis);

    // Extraction takes minutes — finish in the background and let the client
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

/** Leg one: get the audio into storage, then hand off to a fresh worker. */
async function processExtraction(
  supabase: SupabaseClient,
  klangioApiKey: string,
  // deno-lint-ignore no-explicit-any
  analysis: any,
): Promise<void> {
  try {
    const audio = await ensureStoredAudio(supabase, analysis);

    // 'extracted' is the handoff point, and updated_at (maintained by trigger)
    // doubles as the heartbeat the watchdog reads.
    await supabase
      .from('song_analysis')
      .update({ status: STATUS.extracted })
      .eq('id', analysis.id);

    // Hand the rest to a worker with a fresh clock. If the hop can't be made,
    // carry on here rather than leaving the row waiting on a retry.
    if (audio.stored && await kickTranscription(analysis.id)) return;

    console.warn('Transcribing in the extraction worker (no handoff available):', analysis.id);
    await processTranscription(supabase, klangioApiKey, analysis.id, audio.blob, audio.filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('Extraction failed:', { analysisId: analysis.id, message });
    await markFailed(supabase, analysis.id, message);
    await backfillFailedTitle(supabase, analysis);
  }
}

/** Leg two: transcribe stored audio and publish the result. Idempotent. */
async function processTranscription(
  supabase: SupabaseClient,
  klangioApiKey: string,
  analysisId: string,
  blob?: Blob,
  filename?: string,
): Promise<void> {
  const { data: analysis, error: loadError } = await supabase
    .from('song_analysis')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (loadError || !analysis) {
    console.error('Transcription could not load the analysis:', analysisId, loadError?.message);
    return;
  }
  if (analysis.status === STATUS.completed) return;

  // Say we're alive. Between here and the final write this leg touches nothing,
  // so without this a transcription that simply takes a while is indistinguish-
  // able from a dead worker — and the watchdog starts a second one on top of
  // it, which doubles the load on Klangio and makes both slower. Rewriting the
  // status refreshes updated_at via the table's trigger.
  await supabase
    .from('song_analysis')
    .update({ status: STATUS.extracted })
    .eq('id', analysisId)
    .neq('status', STATUS.completed);

  try {
    let audio = blob;
    let name = filename;

    if (!audio) {
      if (!analysis.file_path) {
        throw new Error('The extracted audio is missing. Please try analyzing this song again.');
      }
      const { data: downloaded, error } = await supabase.storage
        .from('audio_files')
        .download(analysis.file_path);
      if (error || !downloaded) {
        throw new Error(`Could not read the stored audio: ${error?.message ?? 'not found'}`);
      }
      audio = downloaded;
      name = `audio.${analysis.file_path.split('.').pop()?.toLowerCase() || 'mp3'}`;
    }

    console.log('Starting Klangio analysis:', {
      analysisId,
      bytes: audio.size,
      filename: name,
    });

    const result = await analyzeAudio(klangioApiKey, audio, name ?? 'audio.mp3');

    // Klangio hears every passing flicker. Store the chord list and the
    // repeating loop as a player would read them, snapped to the song's beat
    // grid — the raw timeline stays untouched for playback accuracy.
    const cleaned = cleanTimeline(
      result.chordsTimeline,
      result.beats,
      result.bpm,
      result.timeSignature,
    );
    const progression = mainProgression(
      result.chordsTimeline,
      result.beats,
      result.bpm,
      result.timeSignature,
      result.key,
    );

    // Claim the completion. A watchdog retry can race the original worker, and
    // whoever actually flips the row is the one that spends the credit — so a
    // resumed analysis can never charge twice.
    const { data: claimed, error: updateError } = await supabase
      .from('song_analysis')
      .update({
        status: STATUS.completed,
        key: result.key,
        bpm: result.bpm,
        time_signature: result.timeSignature,
        chords: chordsInOrder(cleaned).length ? chordsInOrder(cleaned) : result.chords,
        chords_timeline: result.chordsTimeline,
        beats: result.beats,
        main_progression: progression,
        error_message: null,
      })
      .eq('id', analysisId)
      .neq('status', STATUS.completed)
      .select('id');

    if (updateError) throw updateError;
    if (!claimed || claimed.length === 0) {
      console.log('Another worker completed this analysis first:', analysisId);
      return;
    }

    await deductCredit(supabase, analysis.user_id);
    console.log('Analysis completed:', analysisId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    console.error('Transcription failed:', { analysisId, message });
    await markFailed(supabase, analysisId, message);
    await backfillFailedTitle(supabase, analysis);
  }
}

// Invoking ourselves is cheaper than a second deployed function and keeps the
// Klangio code in one place; the gateway still wants a real JWT, and the
// service role key is one.
async function kickTranscription(analysisId: string): Promise<boolean> {
  const secret = Deno.env.get('INTERNAL_FN_SECRET');
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !baseUrl || !serviceKey) return false;

  try {
    const response = await fetch(`${baseUrl}/functions/v1/analyze-song`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ analysisId }),
    });
    if (!response.ok) {
      console.warn('Transcription handoff rejected:', response.status, (await response.text()).slice(0, 200));
      return false;
    }
    // Drain the body so the connection closes cleanly before this worker ends
    await response.text();
    return true;
  } catch (error) {
    console.warn('Transcription handoff failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Failed YouTube analyses would otherwise sit in the dashboard titled
// "YouTube song (fetching title...)" — oEmbed usually knows the real title
// even when the download is blocked. Cosmetic and best-effort only.
async function backfillFailedTitle(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  analysis: any,
): Promise<void> {
  if (!analysis.youtube_id) return;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${analysis.youtube_id}&format=json`,
    );
    if (!res.ok) return;
    const meta = await res.json();
    const title = [meta.title, meta.author_name?.replace(/ - Topic$/, '')]
      .filter(Boolean)
      .join(' — ');
    if (!title) return;
    await supabase
      .from('song_analysis')
      .update({ title })
      .eq('id', analysis.id)
      .like('title', 'YouTube song%'); // never overwrite a real title
  } catch {
    // cosmetic only
  }
}

// Always leaves the audio in storage so the transcription leg — original or
// retried, minutes or days later — has something to read.
async function ensureStoredAudio(
  supabase: SupabaseClient,
  // deno-lint-ignore no-explicit-any
  analysis: any,
): Promise<StoredAudio> {
  // Uploads are already in storage; nothing to fetch.
  if (analysis.file_path) {
    const extension = analysis.file_path.split('.').pop()?.toLowerCase() || 'mp3';
    return { filename: `audio.${extension}`, stored: true };
  }

  if (!analysis.url) {
    throw new Error('Analysis has no URL or uploaded file');
  }

  const youtubeId = extractYouTubeId(analysis.url);
  if (youtubeId) {
    const { blob, title, duration, extension } = await fetchYouTubeAudio(youtubeId);
    const storagePath = `${analysis.user_id}/youtube-${youtubeId}.${extension}`;
    const stored = await storeAudio(supabase, analysis.id, storagePath, blob);

    // Surface video metadata right away so the dashboard shows a real title
    await supabase
      .from('song_analysis')
      .update({
        ...(title ? { title } : {}),
        youtube_id: youtubeId,
        ...(duration ? { duration } : {}),
      })
      .eq('id', analysis.id);

    return { blob, filename: `audio.${extension}`, stored };
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
  const blob = await response.blob();
  const stored = await storeAudio(supabase, analysis.id, `${analysis.user_id}/url-${analysis.id}.mp3`, blob);
  return { blob, filename: 'audio.mp3', stored };
}

/** Keeps the audio so analyses survive the video going away, and so the
 *  transcription leg can be retried without paying for the download twice. */
async function storeAudio(
  supabase: SupabaseClient,
  analysisId: string,
  storagePath: string,
  blob: Blob,
): Promise<boolean> {
  const { error } = await supabase.storage
    .from('audio_files')
    .upload(storagePath, blob, { contentType: blob.type, upsert: true });

  if (error) {
    // Not fatal: the caller still holds the blob and can transcribe in place.
    console.warn('Could not store audio:', error.message);
    return false;
  }

  await supabase
    .from('song_analysis')
    .update({ file_path: storagePath })
    .eq('id', analysisId);
  return true;
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
    .update({ status: STATUS.failed, error_message: message })
    .eq('id', analysisId);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
