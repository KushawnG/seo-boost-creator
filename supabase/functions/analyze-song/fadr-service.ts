import { corsHeaders } from './cors.ts';

interface FadrResponse {
  asset: {
    metaData?: {
      key?: string;
      tempo?: number;
    };
    stems?: string[];
  };
  task: {
    status: {
      complete: boolean;
    };
    _id?: string;
  };
}

export async function getFadrUploadUrl(apiKey: string, fileName: string) {
  console.log('Requesting upload URL from FADR');
  const uploadResponse = await fetch('https://api.fadr.com/assets/upload2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      extension: 'mp3',
    }),
  });

  if (!uploadResponse.ok) {
    console.error('Failed to get upload URL:', await uploadResponse.text());
    throw new Error('Failed to get upload URL');
  }

  return uploadResponse.json();
}

export async function uploadFileToFadr(uploadUrl: string, audioFile: ArrayBuffer) {
  console.log('Uploading file to FADR');
  const uploadFileResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'audio/mp3',
    },
    body: audioFile,
  });

  if (!uploadFileResponse.ok) {
    console.error('Failed to upload file:', await uploadFileResponse.text());
    throw new Error('Failed to upload file');
  }
}

export async function createFadrAsset(apiKey: string, fileName: string, s3Path: string) {
  console.log('Creating FADR asset');
  const createAssetResponse = await fetch('https://api.fadr.com/assets', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      extension: 'mp3',
      group: 'song-analysis',
      s3Path,
    }),
  });

  if (!createAssetResponse.ok) {
    console.error('Failed to create asset:', await createAssetResponse.text());
    throw new Error('Failed to create asset');
  }

  return createAssetResponse.json();
}

export async function createAnalysisTask(apiKey: string, assetId: string): Promise<FadrResponse> {
  console.log('Creating analysis task');
  const createTaskResponse = await fetch('https://api.fadr.com/assets/analyze/stem', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      _id: assetId,
    }),
  });

  if (!createTaskResponse.ok) {
    console.error('Failed to create task:', await createTaskResponse.text());
    throw new Error('Failed to create analysis task');
  }

  return createTaskResponse.json();
}

export async function pollTaskStatus(apiKey: string, taskId: string): Promise<FadrResponse> {
  console.log('Polling for task completion');
  let attempts = 0;
  const maxAttempts = 12; // 1 minute total waiting time

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between polls
    
    const taskStatusResponse = await fetch(`https://api.fadr.com/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!taskStatusResponse.ok) {
      console.error('Failed to check task status:', await taskStatusResponse.text());
      throw new Error('Failed to check task status');
    }

    const response: FadrResponse = await taskStatusResponse.json();
    
    if (response.task.status.complete) {
      return response;
    }
    
    attempts++;
  }

  throw new Error('Analysis timed out');
}