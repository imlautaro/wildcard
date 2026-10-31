import { themeScript, themeStorageKey, type ThemePreference } from '../utils/theme';

// The inline <head> script applies the theme before the first paint. This plugin
// covers the case where it was not emitted, and keeps the preference state
// in sync when another tab changes it (the script itself repaints this tab).
export default defineNuxtPlugin(() => {
  if (!window.__wildcardTheme) new Function(themeScript)();
  const preference = useState<ThemePreference>('theme-preference');
  window.addEventListener('storage', (event) => {
    if (event.key !== themeStorageKey && event.key !== null) return;
    preference.value = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
  });
});
