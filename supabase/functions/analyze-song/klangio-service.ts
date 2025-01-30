const KLANGIO_API_BASE_URL = 'https://api.klangio.io/v1';

export async function analyzeAudio(apiKey: string, audioData: Blob) {
  console.log('Starting Klangio audio analysis');
  
  try {
    const formData = new FormData();
    formData.append('file', audioData);

    const response = await fetch(`${KLANGIO_API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Klangio API error:', errorText);
      throw new Error(`Klangio API error: ${errorText}`);
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