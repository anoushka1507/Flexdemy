export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'flexdemy_theme';
export const DYSLEXIA_STORAGE_KEY = 'flexdemy_dyslexia';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // LocalStorage might be restricted
  }
  return 'system';
}

export function getSystemIsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDyslexiaMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.body?.classList.contains('dyslexia-mode') || false;
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return getSystemIsDark() ? 'dark' : 'light';
}

/**
 * Applies the requested theme.
 * If Dyslexia Mode is active, dark mode must NOT apply and the dedicated
 * high-readability light presentation is enforced instead.
 */
export function applyTheme(mode: ThemeMode, forceAllowDark: boolean = false): 'light' | 'dark' {
  const resolved = resolveTheme(mode);
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // LocalStorage might be restricted
    }
  }

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const dyslexiaActive = !forceAllowDark && isDyslexiaMode();

    if (resolved === 'dark' && !dyslexiaActive) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }

  return resolved;
}

/**
 * Synchronizes theme with Dyslexia Mode.
 * When Dyslexia Mode is ON:
 * - Drops .dark from the DOM root and enforces readable light appearance.
 * - Stores/preserves the user's prior Light/Dark/System preference.
 * When Dyslexia Mode is OFF:
 * - Restores the user's previously chosen theme preference.
 */
export function syncThemeWithDyslexia(isDyslexia: boolean, storedTheme?: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const targetTheme = storedTheme || getStoredTheme();

  if (isDyslexia) {
    document.body.classList.add('dyslexia-mode');
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  } else {
    document.body.classList.remove('dyslexia-mode');
    applyTheme(targetTheme, true);
  }
}

/**
 * Applies the dedicated Flexdemy Light theme boundary for authentication pages
 * (Login, Signup, Forgot/Reset Password, Logged-out screens).
 * Enforces light theme on DOM root and removes dyslexia-mode without altering
 * the user's stored dashboard preference in localStorage.
 */
export function applyAuthThemeBoundary(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('dark');
  root.setAttribute('data-theme', 'light');
  root.style.colorScheme = 'light';
  document.body?.classList.remove('dyslexia-mode');
}

/**
 * Restores the user's saved dashboard theme (light/dark/system) and Dyslexia mode
 * when navigating from authentication pages into the dashboard.
 */
export function restoreDashboardTheme(
  preferredTheme?: ThemeMode,
  isDyslexia?: boolean
): void {
  if (typeof document === 'undefined') return;
  const theme = preferredTheme || getStoredTheme();
  const dyslexia =
    isDyslexia !== undefined
      ? isDyslexia
      : typeof localStorage !== 'undefined'
      ? localStorage.getItem(DYSLEXIA_STORAGE_KEY) === 'true'
      : false;
  syncThemeWithDyslexia(dyslexia, theme);
}

export function initTheme(): { theme: ThemeMode; resolvedTheme: 'light' | 'dark' } {
  const theme = getStoredTheme();
  const resolvedTheme = applyTheme(theme);
  return { theme, resolvedTheme };
}

export function subscribeToSystemTheme(
  onThemeChange: (resolved: 'light' | 'dark') => void
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => {
    const current = getStoredTheme();
    if (current === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme('system');
      onThemeChange(resolved);
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  } else if ('addListener' in mediaQuery) {
    (mediaQuery as any).addListener(listener);
    return () => (mediaQuery as any).removeListener(listener);
  }

  return () => {};
}
