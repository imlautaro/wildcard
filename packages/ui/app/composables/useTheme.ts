import { themePreferences, themeStorageKey, type ThemePreference } from '../utils/theme';

declare global { interface Window { __wildcardTheme?: () => void } }

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(themeStorageKey);
    return (themePreferences as readonly string[]).includes(value ?? '') ? value as ThemePreference : 'system';
  } catch { return 'system'; }
}

// The appearance preference for this browser. Not tied to the account: it survives
// sign-out and applies to every account on this device, like the iOS setting.
export function useTheme() {
  const preference = useState<ThemePreference>('theme-preference', () => import.meta.client ? readPreference() : 'system');
  function setPreference(value: ThemePreference) {
    preference.value = value;
    try {
      if (value === 'system') localStorage.removeItem(themeStorageKey);
      else localStorage.setItem(themeStorageKey, value);
    } catch { /* Storage blocked: the choice still applies until reload. */
      document.documentElement.setAttribute('data-theme', value === 'system'
        ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : value);
      return;
    }
    window.__wildcardTheme?.();
  }
  return { preference: readonly(preference), setPreference };
}
