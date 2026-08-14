import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Export a flag to check if Supabase is configured
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;

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

/**
 * Session expiry configuration
 * - access_token: 15-60 minutes (default)
 * - refresh_token: 7-30 days (default)
 * - auto-renewal enabled for seamless sessions
 * - Session expiry can be controlled via Supabase Dashboard
 * - Default: 24 hours for access tokens in production
 */
export const SESSION_EXPIRY_HOURS = parseInt(process.env.SUPABASE_SESSION_EXPIRY || '24', 10);

/**
 * Session security settings
 */
export const SESSION_SECURITY = {
  maxFailedAttempts: 5,
  lockoutDurationMinutes: 15,
  requireEmailVerification: true,
  sessionTimeoutMinutes: SESSION_EXPIRY_HOURS * 60,
};
