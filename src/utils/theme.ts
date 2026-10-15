export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'flexdemy_theme';

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

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return getSystemIsDark() ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode): 'light' | 'dark' {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // LocalStorage might be restricted
    }
  }

  return resolved;
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
    // Fallback for older browsers
    (mediaQuery as any).addListener(listener);
    return () => (mediaQuery as any).removeListener(listener);
  }

  return () => {};
}
