const KLANGIO_API_BASE_URL = 'https://api.klang.io';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100; // ~5 minutes per job

type BeatEntry = [number, number]; // [timestampSec, beatPositionInBar] — 1.0 marks the downbeat
type ChordEntry = [number, number, string]; // [startSec, endSec, chordName]

interface JobResponse {
  job_id: string;
  status_endpoint_url: string;
}

interface StatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  error?: string | null;
}

interface ExtendedChordResult {
  key?: string;
  chords?: ChordEntry[];
  strums?: [number, string][];
}

export interface KlangioAnalysis {
  key: string | null;
  bpm: number | null;
  timeSignature: string | null;
  chords: string[];
  chordsTimeline: ChordEntry[];
  beats: BeatEntry[];
}

export async function analyzeAudio(
  apiKey: string,
  audio: Blob,
  filename: string,
): Promise<KlangioAnalysis> {
  if (!audio || audio.size === 0) {
    throw new Error('Invalid audio data: empty file');
  }

  const [beats, chordResult] = await Promise.all([
    runJob<BeatEntry[]>(apiKey, '/beat-tracking', audio, filename),
    runJob<ExtendedChordResult | ChordEntry[]>(
      apiKey,
      '/chord-recognition-extended?vocabulary=major-minor',
      audio,
      filename,
    ),
  ]);

  // The extended endpoint returns { key, chords, strums }; be tolerant of a
  // bare chord array in case the plain endpoint shape is ever returned.
  const chordsTimeline = Array.isArray(chordResult)
    ? chordResult
    : chordResult.chords ?? [];
  const key = Array.isArray(chordResult) ? null : chordResult.key ?? null;

  if (chordsTimeline.length === 0) {
    throw new Error('No chords detected in this audio.');
  }

  return {
    key,
    bpm: computeBpm(beats),
    timeSignature: computeTimeSignature(beats),
    chords: uniqueChords(chordsTimeline),
    chordsTimeline,
    beats: Array.isArray(beats) ? beats : [],
  };
}

async function runJob<T>(
  apiKey: string,
  endpointWithQuery: string,
  audio: Blob,
  filename: string,
): Promise<T> {
  const formData = new FormData();
  formData.append('file', audio, filename);

  const response = await fetchWithRetry(`${KLANGIO_API_BASE_URL}${endpointWithQuery}`, {
    method: 'POST',
    headers: { 'kl-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    await raiseApiError(response, `create job ${endpointWithQuery}`);
  }

  const job: JobResponse = await response.json();
  console.log(`Klangio job created for ${endpointWithQuery}:`, job.job_id);

  await waitForCompletion(apiKey, job);
  return fetchResult<T>(apiKey, job.job_id);
}

// The Startup plan allows 2 requests/second; concurrent analyses can trip it.
// Back off politely on 429/5xx instead of failing the whole analysis.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 4,
): Promise<Response> {
  let response = await fetch(url, init);
  for (let retry = 1; retry < attempts; retry++) {
    if (response.ok || (response.status !== 429 && response.status < 500)) {
      return response;
    }
    const waitMs = 1500 * retry;
    console.warn(`Klangio ${response.status} — retrying in ${waitMs}ms (${retry}/${attempts - 1})`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(url, init);
  }
  return response;
}

async function waitForCompletion(apiKey: string, job: JobResponse): Promise<void> {
  const statusUrl = job.status_endpoint_url ||
    `${KLANGIO_API_BASE_URL}/job/${job.job_id}/status`;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetchWithRetry(statusUrl, { headers: { 'kl-api-key': apiKey } });
    if (!response.ok) {
      await raiseApiError(response, 'poll job status');
    }

    const status: StatusResponse = await response.json();
    if (status.status === 'COMPLETED') return;
    if (status.status === 'FAILED') {
      throw new Error(mapKlangioError(status.error || 'Analysis failed'));
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Analysis timed out. Please try again with a shorter audio file.');
}

async function fetchResult<T>(apiKey: string, jobId: string): Promise<T> {
  const response = await fetchWithRetry(`${KLANGIO_API_BASE_URL}/job/${jobId}/json`, {
    headers: { 'kl-api-key': apiKey },
  });
  if (!response.ok) {
    await raiseApiError(response, 'fetch job result');
  }

  const result = await response.json();
  // Some deployments return the JSON document as a string payload
  return typeof result === 'string' ? JSON.parse(result) : result;
}

async function raiseApiError(response: Response, context: string): Promise<never> {
  let message = response.statusText;
  try {
    const body = await response.json();
    message = body.error || body.detail || message;
  } catch {
    // non-JSON error body — keep statusText
  }
  console.error(`Klangio API error during ${context}:`, response.status, message);
  throw new Error(mapKlangioError(String(message)));
}

function mapKlangioError(message: string): string {
  switch (message) {
    case 'Audio file format could not be parsed!':
      return 'Unsupported audio format. Please use MP3, WAV, M4A, AAC, or OGG files.';
    case 'Audio file must be longer than 5 seconds!':
      return 'Audio file must be longer than 5 seconds.';
    case 'No notes found!':
      return 'No musical notes detected in the audio.';
    case 'No beats found!':
      return 'No rhythmic pattern detected. The audio may be arhythmic or outside the supported tempo range (40-300 BPM).';
    default:
      return `Analysis failed: ${message}`;
  }
}

function computeBpm(beats: BeatEntry[]): number | null {
  if (!Array.isArray(beats) || beats.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const interval = beats[i][0] - beats[i - 1][0];
    if (interval > 0) intervals.push(interval);
  }
  if (intervals.length === 0) return null;

  // Median interval is robust against missed/doubled beat detections
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return Math.round(60 / median);
}

function computeTimeSignature(beats: BeatEntry[]): string | null {
  if (!Array.isArray(beats) || beats.length === 0) return null;
  const beatsPerBar = Math.round(Math.max(...beats.map(([, position]) => position)));
  return beatsPerBar >= 2 && beatsPerBar <= 12 ? `${beatsPerBar}/4` : null;
}

function uniqueChords(timeline: ChordEntry[]): string[] {
  return [
    ...new Set(
      timeline
        .map(([, , chord]) => chord)
        .filter((chord) => chord !== 'N' && chord !== 'X'),
    ),
  ];
}
