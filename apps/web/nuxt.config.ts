// The browser only talks to this Worker. Server routes forward /api/v1/* to the
// API Worker through a service binding and keep the session token in a cookie.
// The design system (tokens, components, icons, ripple, font) comes from the
// shared Wildcard UI layer; main.css holds only this app's own styles.
import { connectorLogos } from './app/utils/connectorLogos';

// Message files under i18n/locales/<code>/<area>.json; every area exists for every locale.
const messageAreas = ['common', 'errors', 'auth', 'account', 'contacts', 'chat', 'groups', 'updates', 'miniapps'];
const localeFiles = [['en', 'en-US', 'English'], ['es', 'es', 'Español']] as const;

export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  modules: ['@nuxtjs/i18n'],
  compatibilityDate: '2026-10-26',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  // Connector library logos join the layer's Solar icons in the client bundle.
  icon: { clientBundle: { icons: Object.values(connectorLogos) } },
  app: {
    head: {
      title: 'Wildcard',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=0c69391a81ea' },
      ],
    },
  },
  runtimeConfig: {
    // Local development only. Production requires the API service binding.
    apiOrigin: 'http://localhost:8787',
  },
  nitro: {
    preset: 'cloudflare_module',
    // `wrangler` takes the same shape as wrangler.json and is merged into the generated
    // .output/server/wrangler.json (https://nitro.build/deploy/providers/cloudflare).
    cloudflare: { deployConfig: true, nodeCompat: true, wrangler: { preview_urls: true } },
    routeRules: {
      '/**': { headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      } },
    },
  },
  // English is the default and the fallback for any missing message. No URL prefix:
  // app/plugins/locale.ts picks the locale from the saved Language preference or
  // the browser languages (docs/localization.md). Each area owns one message file.
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    detectBrowserLanguage: false,
    locales: localeFiles.map(([code, language, name]) => ({
      code, language, name, files: messageAreas.map(area => `${code}/${area}.json`),
    })),
  },
  typescript: { strict: true },
});
