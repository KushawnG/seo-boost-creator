
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { createBlobFromArrayBuffer } from './file-utils.ts';

export const initSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase configuration:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey
    });
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

export const downloadFromStorage = async (supabase: any, filePath: string): Promise<Blob> => {
  // Get file metadata
  const { data: metadata, error: metadataError } = await supabase.storage
    .from('audio_files')
    .getMetadata(filePath);

  if (metadataError) {
    console.error('Metadata fetch error:', {
      message: metadataError.message,
      details: metadataError,
      filePath
    });
    throw new Error(`Failed to get file metadata: ${metadataError.message}`);
  }

  if (!metadata) {
    console.error('No metadata received:', { filePath });
    throw new Error('No file metadata available');
  }

  console.log('File metadata:', metadata);

  // Download the file
  const { data, error: downloadError } = await supabase.storage
    .from('audio_files')
    .download(filePath);

  if (downloadError) {
    console.error('Download error:', {
      message: downloadError.message,
      details: downloadError,
      filePath
    });
    throw new Error(`Failed to download file: ${downloadError.message}`);
  }

  if (!data) {
    console.error('No file data received from storage:', { filePath });
    throw new Error('No file data received from storage');
  }

  // Convert to blob
  try {
    const arrayBuffer = await data.arrayBuffer();
    const audioData = await createBlobFromArrayBuffer(arrayBuffer, metadata.mimetype || data.type);
    
    console.log('File processed successfully:', {
      originalSize: data.size,
      originalType: data.type,
      blobSize: audioData.size,
      blobType: audioData.type,
      filePath
    });

    return audioData;
  } catch (conversionError) {
    console.error('File conversion error:', {
      error: conversionError,
      filePath
    });
    throw new Error('Failed to process audio file');
  }
};

export const downloadFromUrl = async (url: string): Promise<Blob> => {
  console.log('Downloading file from URL:', url);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('URL fetch error:', {
        status: response.status,
        statusText: response.statusText,
        url
      });
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const arrayBuffer = await response.arrayBuffer();
    const audioData = await createBlobFromArrayBuffer(arrayBuffer, contentType);
    
    console.log('URL file downloaded successfully:', {
      size: audioData.size,
      type: audioData.type,
      url
    });

    return audioData;
  } catch (fetchError) {
    console.error('URL fetch error:', {
      error: fetchError,
      url
    });
    throw fetchError;
  }
};
