// The Language preference for this browser: System (the browser languages) or an
// explicit English/Spanish choice. Like Appearance it is per device, not per
// account: it survives sign-out and applies to every account in this browser.
// Never register a session reset here (see useSession). docs/localization.md.
export const languagePreferences = ['system', 'en', 'es'] as const;
export type LanguagePreference = typeof languagePreferences[number];
export const languageStorageKey = 'wildcard-language';

export function readLanguagePreference(): LanguagePreference {
  try {
    const value = localStorage.getItem(languageStorageKey);
    return (languagePreferences as readonly string[]).includes(value ?? '') ? value as LanguagePreference : 'system';
  } catch { return 'system'; }
}

export function resolveLanguage(preference: LanguagePreference): AppLocale {
  return preference === 'system' ? browserLocale() : preference;
}

export function useLanguage() {
  const preference = useState<LanguagePreference>('language-preference', () => import.meta.client ? readLanguagePreference() : 'system');
  const { setLocale } = useI18n();
  async function setPreference(value: LanguagePreference) {
    preference.value = value;
    try {
      if (value === 'system') localStorage.removeItem(languageStorageKey);
      else localStorage.setItem(languageStorageKey, value);
    } catch { /* Storage blocked: the choice still applies until reload. */ }
    await setLocale(resolveLanguage(value));
  }
  return { preference: readonly(preference), setPreference };
}
