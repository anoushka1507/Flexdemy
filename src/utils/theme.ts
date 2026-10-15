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

// ============================================================
// DYSLEXIA MODE READING PREFERENCES
// ============================================================

export type DyslexiaFont = 'standard' | 'lexend';
export type DyslexiaBackground = 'warm' | 'soft-white' | 'mint';

export interface DyslexiaPrefs {
  dyslexiaFont: DyslexiaFont;
  dyslexiaTextSize: number;
  dyslexiaLineSpacing: number;
  dyslexiaLetterSpacing: number;
  dyslexiaBackground: DyslexiaBackground;
}

const DYSLEXIA_FONT_STACKS: Record<DyslexiaFont, string> = {
  standard: "'Atkinson Hyperlegible Next', 'Inter', sans-serif",
  lexend: "'Lexend', 'Inter', sans-serif",
};

const DYSLEXIA_BACKGROUNDS: Record<
  DyslexiaBackground,
  { bg: string; text: string; surface: string; border: string }
> = {
  warm: { bg: '#faf6ef', text: '#2b2420', surface: '#ffffff', border: '#e3dcc9' },
  'soft-white': { bg: '#f7f7f5', text: '#222222', surface: '#ffffff', border: '#dedede' },
  mint: { bg: '#eef5f0', text: '#1f2a24', surface: '#ffffff', border: '#cfe3d7' },
};

// Values are applied as inline CSS custom properties on <body> so every
// page, dialog, and nested component picks them up through the same
// --dys-* tokens index.css already uses — no per-component wiring needed,
// and nothing here touches Dark Mode's own tokens.
export function applyDyslexiaPrefs(prefs: DyslexiaPrefs): void {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const bgSet = DYSLEXIA_BACKGROUNDS[prefs.dyslexiaBackground] || DYSLEXIA_BACKGROUNDS.warm;

  body.style.setProperty('--dys-font', DYSLEXIA_FONT_STACKS[prefs.dyslexiaFont] || DYSLEXIA_FONT_STACKS.standard);
  body.style.setProperty('--dys-font-size', `${prefs.dyslexiaTextSize}px`);
  body.style.setProperty('--dys-line-height', `${prefs.dyslexiaLineSpacing}`);
  body.style.setProperty('--dys-letter-spacing', `${prefs.dyslexiaLetterSpacing}em`);
  body.style.setProperty('--dys-bg', bgSet.bg);
  body.style.setProperty('--dys-text', bgSet.text);
  body.style.setProperty('--dys-surface', bgSet.surface);
  body.style.setProperty('--dys-border', bgSet.border);
}
