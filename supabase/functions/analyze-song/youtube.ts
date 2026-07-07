import { Innertube } from 'npm:youtubei.js@13';

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

const APIFY_ACTOR = 'quiet_silicon~youtube-mp3-downloader';

// Paid fallback for videos YouTube blocks from server IPs (label-protected
// content). Costs ~ $0.06 per download, so it only runs after every free
// client has failed. Returns null when unconfigured or unsuccessful.
async function fetchViaApify(videoId: string): Promise<Blob | null> {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return null;

  try {
    const response = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=240`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
      },
    );
    if (!response.ok) {
      console.warn('Apify run failed:', response.status, (await response.text()).slice(0, 200));
      return null;
    }

    const items = await response.json();
    const item = Array.isArray(items) ? items[0] : null;
    if (!item?.success || !item.file_url) {
      console.warn('Apify returned no file:', JSON.stringify(item).slice(0, 200));
      return null;
    }

    const download = await fetch(item.file_url);
    if (!download.ok) {
      console.warn('Apify file download failed:', download.status);
      return null;
    }
    const buffer = await download.arrayBuffer();
    if (buffer.byteLength === 0) return null;

    console.log('YouTube audio fetched via Apify:', { videoId, bytes: buffer.byteLength });
    return new Blob([buffer], { type: 'audio/mpeg' });
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

  const info = await yt.getBasicInfo(videoId);
  let title = info.basic_info.title ?? '';
  const duration = info.basic_info.duration ?? 0;

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
  const apifyBlob = await fetchViaApify(videoId);
  if (apifyBlob) {
    return { blob: apifyBlob, title, duration, extension: 'mp3' };
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
