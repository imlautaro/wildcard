// vue-i18n options for apps/web. English is the fallback for any message missing
// from another locale; the locale files themselves are listed in nuxt.config.ts.
export default defineI18nConfig(() => ({
  fallbackLocale: 'en',
  fallbackWarn: false,
  missingWarn: import.meta.dev,
}));
