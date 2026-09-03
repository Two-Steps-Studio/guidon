import { createBrowserClient } from '@supabase/ssr';
import { assertValidSupabaseUrl } from './supabase-env';

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

  assertValidSupabaseUrl(supabaseUrl);

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
