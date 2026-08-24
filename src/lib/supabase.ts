import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Create a Supabase client for browser-side use
 * Call this function inside components, not at import time
 */
export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.');
  }

  // Basic URL validation
  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(`Invalid Supabase URL: "${supabaseUrl}". Must be a valid HTTP or HTTPS URL (e.g., https://your-project.supabase.co)`);
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
