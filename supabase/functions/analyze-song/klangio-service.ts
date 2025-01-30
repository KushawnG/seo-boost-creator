const KLANGIO_API_BASE_URL = 'https://api.klang.io';

export async function analyzeAudio(apiKey: string, audioData: Blob) {
  console.log('Starting Klangio audio analysis');
  
  try {
    const formData = new FormData();
    formData.append('file', audioData); // Changed from 'audio' to 'file' as per docs

    // Add query parameters for vocabulary
    const url = new URL(`${KLANGIO_API_BASE_URL}/chord-recognition`);
    url.searchParams.append('vocabulary', 'major-minor');

    console.log('Sending request to Klangio API...');
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'kl-api-key': apiKey, // Changed from Authorization Bearer to kl-api-key
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Klangio API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Klangio API error: ${response.status} - ${errorText}`);
    }

    const jobData = await response.json();
    console.log('Received job data:', jobData);

    // Poll for results
    const result = await pollForResults(jobData.status_endpoint_url, apiKey);
    console.log('Analysis results:', result);

    // Process the results to extract key information
    const processedResults = processChordResults(result);
    
    return processedResults;
  } catch (error) {
    console.error('Error analyzing audio:', error);
    throw error;
  }
}

async function pollForResults(statusUrl: string, apiKey: string, maxAttempts = 30): Promise<any> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(statusUrl, {
      headers: {
        'kl-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch status: ${response.status}`);
    }

    const status = await response.json();
    
    if (status.status === 'completed') {
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error('Analysis failed');
    }

    // Wait 2 seconds before next attempt
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Analysis timed out');
}

function processChordResults(results: [number, number, string][]): {
  key: string;
  bpm: number;
  chords: string[];
} {
  // Extract unique chords (excluding N and X)
  const uniqueChords = [...new Set(
    results
      .map(([, , chord]) => chord)
      .filter(chord => chord !== 'N' && chord !== 'X')
  )];

  // Determine the key based on the most frequent chord
  const chordCounts = new Map<string, number>();
  results.forEach(([start, end, chord]) => {
    if (chord !== 'N' && chord !== 'X') {
      const duration = end - start;
      chordCounts.set(chord, (chordCounts.get(chord) || 0) + duration);
    }
  });

  let key = 'Unknown';
  let maxDuration = 0;
  chordCounts.forEach((duration, chord) => {
    if (duration > maxDuration) {
      maxDuration = duration;
      key = chord.split(':')[0]; // Extract note from chord (e.g., "E:maj" -> "E")
    }
  });

  // Calculate approximate BPM based on chord changes
  const chordChanges = results.length - 1;
  const totalDuration = results[results.length - 1][1] - results[0][0];
  const approximateBPM = Math.round((chordChanges / totalDuration) * 60);

  return {
    key,
    bpm: approximateBPM,
    chords: uniqueChords,
  };
}