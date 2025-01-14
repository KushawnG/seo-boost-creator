const FADR_API_BASE_URL = 'https://api.fadr.com';

export async function getFadrUploadUrl(apiKey: string, fileName: string) {
  console.log('Requesting upload URL from FADR for:', fileName);
  const extension = fileName.split('.').pop() || 'mp3';
  
  const response = await fetch(`${FADR_API_BASE_URL}/assets/upload2`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: fileName,
      extension,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get upload URL:', errorText);
    throw new Error(`Failed to get upload URL: ${errorText}`);
  }

  const data = await response.json();
  console.log('Upload URL response:', data);
  return data;
}

export async function uploadFileToFadr(uploadUrl: string, fileData: Blob) {
  console.log('Uploading file to FADR URL:', uploadUrl);
  
  // Create a new XMLHttpRequest to handle the upload with progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentage = (event.loaded / event.total) * 100;
        console.log(`Upload progress: ${Math.round(percentage)}%`);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        console.log('File upload successful');
        resolve(xhr.response);
      } else {
        console.error('Upload failed with status:', xhr.status);
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      console.error('Upload failed');
      reject(new Error('Upload failed'));
    });

    xhr.addEventListener('timeout', () => {
      console.error('Upload timed out');
      reject(new Error('Upload timed out'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'audio/mpeg');
    xhr.timeout = 300000; // 5 minutes timeout
    xhr.send(fileData);
  });
}

export async function createFadrAsset(apiKey: string, fileName: string, s3Path: string) {
  console.log('Creating FADR asset for:', fileName);
  const response = await fetch(`${FADR_API_BASE_URL}/assets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: fileName,
      extension: fileName.split('.').pop() || 'mp3',
      group: 'song-analysis',
      s3Path,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to create asset:', errorText);
    throw new Error(`Failed to create asset: ${errorText}`);
  }

  const data = await response.json();
  console.log('Asset creation response:', data);
  return data;
}

export async function waitForAssetUpload(apiKey: string, assetId: string, maxAttempts = 60) {
  console.log('Waiting for asset upload completion:', assetId);
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const response = await fetch(`${FADR_API_BASE_URL}/assets/${assetId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to check asset status:', errorText);
      throw new Error(`Failed to check asset status: ${errorText}`);
    }

    const data = await response.json();
    console.log(`Asset status check response (attempt ${attempts + 1}/${maxAttempts}):`, data);
    
    if (data.asset?.uploadComplete) {
      console.log('Asset upload completed');
      return data.asset;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
    attempts++;
  }

  throw new Error('Asset upload completion timeout - please try with a smaller file');
}

export async function createAnalysisTask(apiKey: string, assetId: string) {
  console.log('Creating analysis task for asset:', assetId);
  const response = await fetch(`${FADR_API_BASE_URL}/assets/analyze/stem`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      _id: assetId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to create analysis task:', errorText);
    throw new Error(`Failed to create analysis task: ${errorText}`);
  }

  const data = await response.json();
  console.log('Analysis task creation response:', data);
  return data;
}

export async function pollTaskStatus(apiKey: string, taskId: string) {
  console.log('Starting to poll task status for:', taskId);
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes total waiting time
  
  while (attempts < maxAttempts) {
    console.log(`Polling attempt ${attempts + 1} of ${maxAttempts}`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between polls
    
    const response = await fetch(`${FADR_API_BASE_URL}/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to check task status:', errorText);
      throw new Error(`Failed to check task status: ${errorText}`);
    }

    const data = await response.json();
    console.log('Poll response:', data);
    
    if (data.task?.status?.complete) {
      // Get the updated asset data after task completion
      const assetResponse = await fetch(`${FADR_API_BASE_URL}/assets/${data.task.asset}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      if (!assetResponse.ok) {
        const errorText = await assetResponse.text();
        console.error('Failed to get final asset data:', errorText);
        throw new Error(`Failed to get final asset data: ${errorText}`);
      }
      
      const assetData = await assetResponse.json();
      console.log('Final asset data:', assetData);
      
      if (!assetData.asset) {
        console.error('No asset data in final response:', assetData);
        throw new Error('Missing asset data in final response');
      }
      
      return assetData;
    }
    
    attempts++;
  }

  throw new Error('Analysis timed out after 10 minutes - please try with a smaller file');
}