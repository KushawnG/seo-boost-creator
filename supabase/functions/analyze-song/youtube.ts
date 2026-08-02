import { Innertube } from 'npm:youtubei.js@17';

// All plans support songs up to 5 minutes (Klangio Startup's hard cap is
// 300s); the slack covers metadata rounding.
const MAX_DURATION_SECONDS = 5 * 60 + 20;

const YOUTUBE_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_ID_PATTERN);
  return match ? match[1] : null;
}

export interface YouTubeAudio {
  blob: Blob;
  title: string;
  duration: number;
  extension: 'm4a' | 'mp3';
}

// Switched from quiet_silicon~youtube-mp3-downloader 2026-08-02: that actor's
// proxy infrastructure broke (every run returned "Connection refused").
const APIFY_ACTOR = 'lurkapi~youtube-to-mp3-audio-downloader';

interface ApifyResult {
  blob: Blob;
  title?: string;
  duration?: number;
}

// Paid fallback for videos YouTube blocks from server IPs (which as of
// mid-2026 is most of them). Costs cents per download, so it only runs after
// every free client has failed. Returns null when unconfigured or failed.
async function fetchViaApify(videoId: string): Promise<ApifyResult | null> {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return null;

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=240`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrls: [`https://www.youtube.com/watch?v=${videoId}`] }),
      },
    );
    if (!response.ok) {
      console.warn('Apify run failed:', response.status, (await response.text()).slice(0, 200));
      return null;
    }

    const items = await response.json();
    const item = Array.isArray(items) ? items[0] : null;
    if (item?.status !== 'Success' || !item.audioFileUrl) {
      console.warn('Apify returned no file:', JSON.stringify(item).slice(0, 300));
      return null;
    }

    // The audio lands in the run's key-value store — authenticate the download
    const download = await fetch(`${item.audioFileUrl}?token=${token}`);
    if (!download.ok) {
      console.warn('Apify file download failed:', download.status);
      return null;
    }
    const buffer = await download.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    console.log('YouTube audio fetched via Apify:', { videoId, bytes: buffer.byteLength });
    return {
      blob: new Blob([buffer], { type: 'audio/mpeg' }),
      title: typeof item.title === 'string' ? item.title : undefined,
      duration: typeof item.duration === 'number' ? item.duration : undefined,
    };
  } catch (error) {
    console.warn('Apify fallback error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Route all youtubei.js traffic through the runtime's native fetch: the Node
// compat path crashes the worker on YouTube's brotli responses. Native fetch
// also rejects the library's own Request objects, so unwrap them.
// deno-lint-ignore no-explicit-any
async function nativeFetch(input: any, init?: RequestInit): Promise<Response> {
  if (typeof input === 'object' && input !== null && 'url' in input) {
    const body = input.method === 'GET' || input.method === 'HEAD'
      ? undefined
      : await input.arrayBuffer();
    return fetch(input.url, {
      method: input.method,
      headers: new Headers(input.headers),
      body,
      ...init,
    });
  }
  return fetch(input, init);
}

export async function fetchYouTubeAudio(videoId: string): Promise<YouTubeAudio> {
  // retrieve_player: false skips fetching YouTube's player JS, which is
  // rate-limited from datacenter IPs; the clients below don't need it.
  const yt = await Innertube.create({
    generate_session_locally: true,
    retrieve_player: false,
    fetch: nativeFetch,
  });

  // Metadata is best-effort: when YouTube rejects the /player call outright
  // (they rotate their private API), we must still reach the download attempts
  // and the Apify fallback below rather than dying here.
  let title = '';
  let duration = 0;
  try {
    const info = await yt.getBasicInfo(videoId);
    title = info.basic_info.title ?? '';
    duration = info.basic_info.duration ?? 0;
  } catch (error) {
    console.warn(
      'getBasicInfo failed (continuing without metadata):',
      error instanceof Error ? error.message : String(error),
    );
  }

  // Protected videos withhold the title from Innertube; oEmbed still has it
  if (!title) {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (oembed.ok) {
        const meta = await oembed.json();
        title = [meta.title, meta.author_name?.replace(/ - Topic$/, '')]
          .filter(Boolean)
          .join(' — ');
      }
    } catch {
      // metadata only — never fail the analysis over it
    }
  }
  if (!title) title = 'YouTube video';

  // duration is 0 when metadata failed — Klangio enforces its own cap then
  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `This video is ${Math.ceil(duration / 60)} minutes long — songs up to 5 minutes are supported. Please use a shorter video or upload a trimmed audio file.`,
    );
  }

  // YouTube blocks stream access per client from datacenter IPs; IOS is the
  // most reliable as of mid-2026, the rest are fallbacks. Label-protected
  // videos may reject all of them ("login required") — nothing recoverable
  // server-side, so the error tells users to upload the file instead.
  const clients = ['IOS', 'ANDROID', 'TV', 'MWEB'] as const;
  let lastError: Error | null = null;

  for (const client of clients) {
    try {
      const stream = await yt.download(videoId, {
        type: 'audio',
        quality: 'bestefficiency',
        format: 'mp4',
        client,
      });
      const buffer = await new Response(stream).arrayBuffer();
      if (buffer.byteLength === 0) throw new Error('Empty audio stream');

      console.log(`YouTube audio fetched via ${client} client:`, {
        videoId,
        title,
        duration,
        bytes: buffer.byteLength,
      });
      return { blob: new Blob([buffer], { type: 'audio/mp4' }), title, duration, extension: 'm4a' };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`YouTube download failed with ${client} client:`, lastError.message);
    }
  }

  console.warn('All direct clients failed, trying Apify fallback:', lastError?.message);
  const apify = await fetchViaApify(videoId);
  if (apify) {
    // Backfill metadata the blocked Innertube call couldn't provide
    const finalTitle = title && title !== 'YouTube video' ? title : (apify.title ?? title);
    const finalDuration = duration || (apify.duration ?? 0);
    if (finalDuration > MAX_DURATION_SECONDS) {
      throw new Error(
        `This video is ${Math.ceil(finalDuration / 60)} minutes long — songs up to 5 minutes are supported. Please use a shorter video or upload a trimmed audio file.`,
      );
    }
    return { blob: apify.blob, title: finalTitle, duration: finalDuration, extension: 'mp3' };
  }

  // "Login required" is YouTube shielding label/copyright-protected content
  // from server access — phrase it in terms users understand.
  if (/login required/i.test(lastError?.message ?? '')) {
    throw new Error(
      'This song is copyright-protected on YouTube, so we can\'t analyze it from the link. Please upload the song\'s audio file instead (MP3, WAV, M4A, AAC, or OGG).',
    );
  }

  throw new Error(
    `Could not fetch audio from YouTube (${lastError?.message ?? 'unknown error'}). Please try uploading the audio file instead.`,
  );
}
