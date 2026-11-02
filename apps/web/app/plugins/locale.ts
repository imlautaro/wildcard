// Applies the Language preference before the first render (plugins are awaited
// before mount, so a Spanish browser never flashes English), binds the global
// composer for translate(), and keeps <html lang> and the shared UI layer's
// built-in strings in sync with the active locale. docs/localization.md.
import type { Composer } from 'vue-i18n';

export default defineNuxtPlugin({
  name: 'wildcard:locale',
  dependsOn: ['i18n:plugin'],
  async setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as unknown as Composer & { setLocale: (locale: string) => Promise<void> };
    bindI18n(i18n);
    await i18n.setLocale(resolveLanguage(readLanguagePreference()));

    // Overrides the layer's static lang="en" through the head manager, which owns <html> attributes.
    useHead({ htmlAttrs: { lang: i18n.locale } });
    const uiStrings = useUiStrings();
    watch(i18n.locale, () => {
      uiStrings.value = {
        loading: translate('common.loading'),
        dismiss: translate('common.dismiss'),
        clearSearch: translate('common.clearSearch'),
        close: translate('common.close'),
        search: translate('common.search'),
        noMatches: translate('common.noMatches'),
      };
    }, { immediate: true });

    // System follows the browser: a language change in browser settings applies live.
    // The ref is captured here: the listener runs outside any Nuxt context.
    const preference = useState<LanguagePreference>('language-preference', readLanguagePreference);
    window.addEventListener('languagechange', () => {
      if (preference.value === 'system') void i18n.setLocale(browserLocale());
    });
  },
});
