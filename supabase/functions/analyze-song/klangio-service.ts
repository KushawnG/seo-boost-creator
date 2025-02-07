const KLANGIO_API_BASE_URL = 'https://api.klang.io';

// API response types
type BeatTrackingResult = [number, number]; // [timestamp, downbeat]
type ChordRecognitionResult = [number, number, string]; // [startTime, endTime, chord]

interface JobResponse {
  job_id: string;
  creation_date: string;
  deletion_date: string;
  status_endpoint_url: string;
}

interface StatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  error?: string;
  result?: BeatTrackingResult[] | ChordRecognitionResult[];
}

const ALLOWED_MIME_TYPES = [
  'audio/mpeg',  // .mp3
  'audio/wav',   // .wav
  'audio/x-m4a', // .m4a
  'audio/aac',   // .aac
  'audio/ogg'    // .ogg
];

export async function analyzeAudio(apiKey: string, audioData: Blob) {
  console.log('Starting Klangio audio analysis:', {
    fileSize: audioData.size,
    fileType: audioData.type
  });

  // Validate blob data
  if (!audioData || audioData.size === 0) {
    throw new Error('Invalid audio data: Empty file');
  }

  if (!ALLOWED_MIME_TYPES.includes(audioData.type)) {
    console.error('Invalid MIME type:', audioData.type);
    throw new Error(`Unsupported audio format: ${audioData.type}. Please use MP3, WAV, M4A, AAC, or OGG files.`);
  }
  
  try {
    // First get the beats and BPM
    console.log('Starting BPM analysis...');
    const bpmData = await analyzeBPM(apiKey, audioData);
    console.log('BPM analysis complete:', {
      dataPoints: bpmData.length,
      firstBeat: bpmData[0],
      lastBeat: bpmData[bpmData.length - 1]
    });

    // Then get the chord progression
    console.log('Starting chord analysis...');
    const chordData = await analyzeChords(apiKey, audioData);
    console.log('Chord analysis complete:', {
      chordCount: chordData.length,
      firstChord: chordData[0],
      lastChord: chordData[chordData.length - 1]
    });

    // Combine and process the results
    const processedResults = processResults(bpmData, chordData);
    console.log('Processed results:', processedResults);
    
    return processedResults;
  } catch (error: any) {
    console.error('Error analyzing audio:', {
      error,
      message: error.message,
      stack: error.stack,
      fileDetails: {
        size: audioData.size,
        type: audioData.type
      }
    });
    throw error;
  }
}

async function analyzeBPM(apiKey: string, audioData: Blob): Promise<BeatTrackingResult[]> {
  const formData = new FormData();
  
  // Create a new blob with a specific filename to ensure proper handling
  const file = new Blob([audioData], { type: audioData.type });
  formData.append('file', file, 'audio.mp3'); // Use .mp3 extension as it's widely supported

  console.log('Sending beat tracking request...');
  const response = await fetch(`${KLANGIO_API_BASE_URL}/beat-tracking`, {
    method: 'POST',
    headers: {
      'kl-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    console.error('Beat tracking request failed:', {
      status: response.status,
      statusText: response.statusText
    });
    await handleApiError(response);
  }

  const jobData: JobResponse = await response.json();
  console.log('Beat tracking job created:', jobData);

  // Poll for results
  const result = await pollForResults<BeatTrackingResult[]>(jobData.status_endpoint_url, apiKey);
  return result;
}

async function analyzeChords(apiKey: string, audioData: Blob): Promise<ChordRecognitionResult[]> {
  const formData = new FormData();
  
  // Create a new blob with a specific filename to ensure proper handling
  const file = new Blob([audioData], { type: audioData.type });
  formData.append('file', file, 'audio.mp3'); // Use .mp3 extension as it's widely supported

  const url = new URL(`${KLANGIO_API_BASE_URL}/chord-recognition`);
  url.searchParams.append('vocabulary', 'major-minor'); // Using simpler vocabulary for better accuracy

  console.log('Sending chord recognition request...');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'kl-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    console.error('Chord recognition request failed:', {
      status: response.status,
      statusText: response.statusText
    });
    await handleApiError(response);
  }

  const jobData: JobResponse = await response.json();
  console.log('Chord recognition job created:', jobData);

  // Poll for results
  const result = await pollForResults<ChordRecognitionResult[]>(jobData.status_endpoint_url, apiKey);
  return result;
}

async function pollForResults<T>(statusUrl: string, apiKey: string, maxAttempts = 60): Promise<T> {
  console.log('Starting to poll for results:', statusUrl);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log(`Polling attempt ${attempt + 1}/${maxAttempts}`);
      
      const response = await fetch(statusUrl, {
        headers: {
          'kl-api-key': apiKey,
        },
      });

      if (!response.ok) {
        console.error('Polling request failed:', {
          status: response.status,
          statusText: response.statusText,
          attempt: attempt + 1
        });
        await handleApiError(response);
      }

      const status: StatusResponse = await response.json();
      console.log('Status response:', {
        status: status.status,
        error: status.error,
        hasResult: !!status.result
      });
      
      if (status.status === 'COMPLETED' && status.result) {
        console.log('Analysis completed successfully');
        return status.result as T;
      } else if (status.status === 'FAILED') {
        console.error('Analysis failed:', status);
        throw new Error(status.error || 'Analysis failed');
      } else if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
        console.log(`Analysis ${status.status.toLowerCase()}...`);
      }

      // Wait 5 seconds before next attempt
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error: any) {
      console.error('Error during polling:', {
        error,
        message: error.message,
        attempt: attempt + 1
      });
      throw error;
    }
  }

  throw new Error(`Analysis timed out after ${maxAttempts} attempts`);
}

async function handleApiError(response: Response): Promise<never> {
  let errorMessage: string;
  let errorData: any;
  
  try {
    errorData = await response.json();
    console.error('API error response:', {
      status: response.status,
      statusText: response.statusText,
      errorData
    });
    errorMessage = errorData.error || response.statusText;
  } catch (error) {
    console.error('Failed to parse error response:', {
      status: response.status,
      statusText: response.statusText,
      error
    });
    errorMessage = response.statusText;
  }

  // Map known API errors to user-friendly messages
  switch (errorMessage) {
    case 'Audio file format could not be parsed!':
      throw new Error('Unsupported audio format. Please use MP3, WAV, M4A, AAC, or OGG files.');
    case 'Audio file must be longer than 5 seconds!':
      throw new Error('Audio file must be longer than 5 seconds.');
    case 'No notes found!':
      throw new Error('No musical notes detected in the audio. The file may be corrupted or contain no music.');
    case 'No beats found!':
      throw new Error('No rhythmic pattern detected. The audio may be arhythmic or outside the supported tempo range (40-300 BPM).');
    default:
      throw new Error(`Klangio API error: ${errorMessage}`);
  }
}

function processResults(beatData: BeatTrackingResult[], chordData: ChordRecognitionResult[]) {
  if (!Array.isArray(beatData) || beatData.length === 0) {
    console.error('Invalid beat tracking results:', beatData);
    throw new Error('Invalid beat tracking results');
  }

  if (!Array.isArray(chordData) || chordData.length === 0) {
    console.error('Invalid chord recognition results:', chordData);
    throw new Error('Invalid chord recognition results');
  }

  // Calculate BPM from beat tracking data
  const beatIntervals = [];
  for (let i = 1; i < beatData.length; i++) {
    const interval = beatData[i][0] - beatData[i - 1][0];
    beatIntervals.push(interval);
  }
  
  // Calculate average interval and convert to BPM
  const averageInterval = beatIntervals.reduce((a, b) => a + b, 0) / beatIntervals.length;
  const bpm = Math.round(60 / averageInterval);

  // Extract unique chords (excluding N and X)
  const uniqueChords = [...new Set(
    chordData
      .map(([, , chord]) => chord)
      .filter(chord => chord !== 'N' && chord !== 'X')
  )];

  // Determine the key based on the most frequent chord
  const chordDurations = new Map<string, number>();
  chordData.forEach(([start, end, chord]) => {
    if (chord !== 'N' && chord !== 'X') {
      const duration = end - start;
      chordDurations.set(chord, (chordDurations.get(chord) || 0) + duration);
    }
  });

  let key = 'Unknown';
  let maxDuration = 0;
  chordDurations.forEach((duration, chord) => {
    if (duration > maxDuration) {
      maxDuration = duration;
      key = chord.split(':')[0]; // Extract note from chord (e.g., "E:maj" -> "E")
    }
  });

  const results = {
    key,
    bpm,
    chords: uniqueChords,
  };

  console.log('Final processed results:', results);
  return results;
}