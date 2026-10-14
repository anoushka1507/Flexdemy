import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * Indicates whether live remote Supabase credentials have been configured.
 * When false, the application operates in local Guest/Offline mode.
 */
export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawKey &&
  !rawUrl.includes('placeholder') &&
  rawUrl.startsWith('https://')
);

// Fallback placeholder endpoint so createClient initialization does not throw at startup
const supabaseUrl = isSupabaseConfigured ? rawUrl : 'https://placeholder-offline-mode.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? rawKey : 'placeholder-offline-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);