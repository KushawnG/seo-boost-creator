
import { corsHeaders } from './cors-config.ts';
import { ErrorDetails } from './types.ts';

export const createErrorResponse = (error: Error, status = 500) => {
  const errorDetails: ErrorDetails = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: error.cause
  };
  
  console.error('Error details:', JSON.stringify(errorDetails, null, 2));
  
  return new Response(
    JSON.stringify({
      error: error.name || 'Error',
      details: error.message,
      timestamp: new Date().toISOString()
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status
    }
  );
};
