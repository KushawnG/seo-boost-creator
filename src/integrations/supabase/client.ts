// This file is automatically generated. Do not edit it directly.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://outhdefsxtskyjmoiuoo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91dGhkZWZzeHRza3lqbW9pdW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYyODkwNTIsImV4cCI6MjA1MTg2NTA1Mn0.l8wtT5ZG-gA_EbPUk1eKBb4V3IkJJYUcAlJVtTKuNIc";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);