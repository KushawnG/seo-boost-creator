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

// Residential exit nodes land in a random country and labels geo-restrict a lot
// of music, so an unpinned proxy fails on perfectly ordinary songs. Pin a market
// and fall through a couple more only when the actor says the country was the
// problem — everything else fails the same way in every country.
const PROXY_COUNTRIES = ['US', 'GB', 'DE'] as const;

function isGeoBlocked(reason: string): boolean {
  return /proxy country|not available in|region/i.test(reason);
}

// YouTube blocks individual proxy exit IPs, and the actor says so plainly:
// "CDN blocked this proxy IP during download. Retry now (usually gets a fresh
// IP)". Same story for Apify's own 5xx. These were being reported to users as
// dead ends when simply going again would most likely have worked.
function isTransient(reason: string): boolean {
  return /blocked this proxy|cdn blocked|fresh ip|rate limit|too many requests|timed? ?out|temporarily|\b(429|500|502|503|504)\b|bad gateway|connection|socket|network/i
    .test(reason);
}

// Extraction runs inside a background task, so it can't retry forever — Klangio
// still needs its turn, and a worker that overruns is killed silently, which is
// how analyses end up stuck on "Analyzing…".
const MAX_APIFY_ATTEMPTS = 3;
const APIFY_BUDGET_MS = 260_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runApifyActor(
  videoId: string,
  token: string,
  country: string,
): Promise<{ result?: ApifyResult; reason: string }> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=150`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoUrls: [`https://www.youtube.com/watch?v=${videoId}`],
        // Datacenter proxies started getting blocked by YouTube (Aug 2026);
        // residential costs ~cents more per download but actually works.
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
          apifyProxyCountry: country,
        },
      }),
    },
  );
  if (!response.ok) {
    return { reason: `Apify run failed (${response.status}): ${(await response.text()).slice(0, 160)}` };
  }

  const items = await response.json();
  const item = Array.isArray(items) ? items[0] : null;
  if (item?.status !== 'Success' || !item.audioFileUrl) {
    return { reason: String(item?.error ?? item?.status ?? 'Apify returned no file').slice(0, 200) };
  }

  // The audio lands in the run's key-value store — authenticate the download
  const download = await fetch(`${item.audioFileUrl}?token=${token}`);
  if (!download.ok) return { reason: `Apify file download failed (${download.status})` };
  const buffer = await download.arrayBuffer();
  if (buffer.byteLength === 0) return { reason: 'Apify returned an empty file' };

  return {
    reason: 'ok',
    result: {
      blob: new Blob([buffer], { type: 'audio/mpeg' }),
      title: typeof item.title === 'string' ? item.title : undefined,
      duration: typeof item.duration === 'number' ? item.duration : undefined,
    },
  };
}

// Paid fallback for videos YouTube blocks from server IPs (which as of
// mid-2026 is most of them). Costs cents per download, so it only runs after
// every free client has failed. `reason` carries the last failure so callers
// can tell users something truthful.
async function fetchViaApify(videoId: string): Promise<{ result: ApifyResult | null; reason: string }> {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return { result: null, reason: 'Apify is not configured' };

  const startedAt = Date.now();
  let lastReason = 'Apify returned no file';
  let countryIndex = 0;

  for (let attempt = 1; attempt <= MAX_APIFY_ATTEMPTS; attempt++) {
    if (Date.now() - startedAt > APIFY_BUDGET_MS) {
      console.warn('Apify budget exhausted, stopping retries:', lastReason);
      break;
    }
    const country = PROXY_COUNTRIES[countryIndex];
    let reason: string;
    try {
      const outcome = await runApifyActor(videoId, token, country);
      if (outcome.result) {
        console.log('YouTube audio fetched via Apify:', {
          videoId,
          country,
          attempt,
          bytes: outcome.result.blob.size,
        });
        return { result: outcome.result, reason: 'ok' };
      }
      reason = outcome.reason;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    lastReason = reason;
    console.warn(`Apify attempt ${attempt} via ${country} failed:`, reason);

    if (isGeoBlocked(reason)) {
      // The country was the problem — a retry there would fail identically.
      countryIndex++;
      if (countryIndex >= PROXY_COUNTRIES.length) break;
      continue;
    }
    if (isTransient(reason)) {
      // Same market, new run: the point is to land on a different exit IP.
      await sleep(2000);
      continue;
    }
    break; // genuinely unavailable — retrying changes nothing
  }
  return { result: null, reason: lastReason };
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
  const { result: apify, reason } = await fetchViaApify(videoId);
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

  // Direct access always fails from server IPs now, so the fallback's reason is
  // the real story. Blaming copyright for every failure sent users off to find
  // an audio file when the actual problem was ours to fix.
  if (isGeoBlocked(reason)) {
    throw new Error(
      'This video is region-locked and we couldn\'t reach it from any of our locations. Please try another upload of the song, or upload the audio file instead.',
    );
  }
  if (isTransient(reason)) {
    // Already retried across fresh proxy IPs; the raw reason here is often an
    // HTML error page, which is no use to anyone reading it in the dashboard.
    throw new Error(
      'YouTube blocked the download this time — that usually clears in a few minutes. Please try again shortly, or upload the audio file instead.',
    );
  }
  if (/unavailable|private|removed|age|restricted/i.test(reason)) {
    throw new Error(
      'This video can\'t be played outside YouTube (it may be private, age-restricted or removed). Please try another version of the song, or upload the audio file instead.',
    );
  }
  if (/login required/i.test(lastError?.message ?? '') && /no file|not configured/i.test(reason)) {
    throw new Error(
      'This song is copyright-protected on YouTube, so we can\'t analyze it from the link. Please upload the song\'s audio file instead (MP3, WAV, M4A, AAC, or OGG).',
    );
  }

  throw new Error(
    `We couldn't fetch this song's audio from YouTube (${reason}). Please try again in a moment, or upload the audio file instead.`,
  );
}
