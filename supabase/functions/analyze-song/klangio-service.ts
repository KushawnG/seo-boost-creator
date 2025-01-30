const KLANGIO_API_BASE_URL = 'https://api.klangio.io/v1';

export async function analyzeAudio(apiKey: string, audioData: Blob) {
  console.log('Starting Klangio audio analysis');
  
  try {
    const formData = new FormData();
    formData.append('audio', audioData, 'audio.mp3'); // Specify filename and proper field name

    console.log('Sending request to Klangio API...');
    const response = await fetch(`${KLANGIO_API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Don't set Content-Type header, let fetch set it with boundary for FormData
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

    const data = await response.json();
    console.log('Klangio analysis response:', data);

    return {
      key: data.key || 'Unknown',
      bpm: data.tempo || 0,
      chords: data.chords || [],
    };
  } catch (error) {
    console.error('Error analyzing audio:', error);
    throw error;
  }
}