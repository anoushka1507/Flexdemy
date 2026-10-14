import { supabase } from '../supabaseClient';

export interface AuthStatus {
  signedIn: boolean;
  userId?: string;
  isGuest: boolean;
  token?: string;
  isExpired?: boolean;
}

/**
 * Retrieves the active Supabase session access token, refreshing if expired.
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      return null;
    }

    const { session } = sessionData;
    const nowSec = Math.floor(Date.now() / 1000);

    // If token expires within 30 seconds, proactively refresh it
    if (session.expires_at && session.expires_at - nowSec < 30) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        console.warn('Supabase token expired and refresh failed. Falling back to guest session.', refreshError);
        return null;
      }
      return refreshData.session.access_token;
    }

    return session.access_token;
  } catch (err) {
    console.warn('Error reading Supabase session token:', err);
    return null;
  }
}

/**
 * Returns the current authentication status for UX and mastery indicators.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const token = await getValidAccessToken();
  if (!token) {
    return { signedIn: false, isGuest: true };
  }

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;

  return {
    signedIn: true,
    userId,
    isGuest: false,
    token,
  };
}

export interface ApiFetchOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Shared authenticated API-fetch helper that automatically attaches
 * the current Supabase bearer token when available.
 * Handles expired tokens explicitly and supports guest mode.
 */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { requireAuth = false, headers = {}, ...rest } = options;

  const token = await getValidAccessToken();

  if (requireAuth && !token) {
    throw new Error('Authentication required: please sign in to save persistent progress.');
  }

  const requestHeaders = new Headers(headers);

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  // Set Content-Type only if not sending FormData
  if (!(rest.body instanceof FormData) && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...rest,
    headers: requestHeaders,
  });
}
