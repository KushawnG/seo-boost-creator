const KLANGIO_API_BASE_URL = 'https://api.klang.io';

export async function analyzeAudio(apiKey: string, audioData: Blob) {
  console.log('Starting Klangio audio analysis');
  
  try {
    const formData = new FormData();
    formData.append('file', audioData);

    const url = new URL(`${KLANGIO_API_BASE_URL}/chord-recognition`);
    url.searchParams.append('vocabulary', 'major-minor');

    console.log('Sending request to Klangio API...');
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'kl-api-key': apiKey,
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

    // Poll for results with increased timeout and polling interval
    const result = await pollForResults(jobData.status_endpoint_url, apiKey);
    console.log('Analysis results:', result);

    const processedResults = processChordResults(result);
    console.log('Processed results:', processedResults);
    
    return processedResults;
  } catch (error) {
    console.error('Error analyzing audio:', error);
    throw error;
  }
}

async function pollForResults(statusUrl: string, apiKey: string, maxAttempts = 60): Promise<any> {
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
        console.error('Error response from status endpoint:', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`Failed to fetch status: ${response.status}`);
      }

      const status = await response.json();
      console.log('Status response:', status);
      
      if (status.status === 'completed') {
        console.log('Analysis completed successfully');
        return status.result;
      } else if (status.status === 'failed') {
        console.error('Analysis failed:', status);
        throw new Error(`Analysis failed: ${status.error || 'Unknown error'}`);
      } else if (status.status === 'processing') {
        console.log('Analysis still processing...');
      }

      // Wait 5 seconds before next attempt (increased from 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error('Error during polling:', error);
      throw error;
    }
  }

  throw new Error(`Analysis timed out after ${maxAttempts} attempts`);
}

function processChordResults(results: [number, number, string][]): {
  key: string;
  bpm: number;
  chords: string[];
} {
  if (!Array.isArray(results) || results.length === 0) {
    console.warn('No results to process, returning defaults');
    return {
      key: 'Unknown',
      bpm: 0,
      chords: [],
    };
  }

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