// vue-i18n options for apps/site. English is the fallback for any message missing
// from another locale; the locales and their files are listed in nuxt.config.ts.
export default defineI18nConfig(() => ({
  fallbackLocale: 'en',
  fallbackWarn: false,
  missingWarn: import.meta.dev,
}));
