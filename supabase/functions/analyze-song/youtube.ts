import { Innertube } from 'npm:youtubei.js@13';

// Keep quota usage sane: longest song we will pull from YouTube
const MAX_DURATION_SECONDS = 10 * 60;

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
}

export async function fetchYouTubeAudio(videoId: string): Promise<YouTubeAudio> {
  const yt = await Innertube.create({ generate_session_locally: true });

  const info = await yt.getBasicInfo(videoId);
  const title = info.basic_info.title ?? 'YouTube video';
  const duration = info.basic_info.duration ?? 0;

  if (duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `This video is ${Math.round(duration / 60)} minutes long. Please use a video shorter than ${MAX_DURATION_SECONDS / 60} minutes.`,
    );
  }

  // Some clients are blocked or require signature deciphering depending on
  // the video, so walk through a few until one yields a stream.
  const clients = ['ANDROID', 'IOS', 'WEB'] as const;
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
      return { blob: new Blob([buffer], { type: 'audio/mp4' }), title, duration };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`YouTube download failed with ${client} client:`, lastError.message);
    }
  }

  throw new Error(
    `Could not fetch audio from YouTube (${lastError?.message ?? 'unknown error'}). Please try uploading the audio file instead.`,
  );
}
