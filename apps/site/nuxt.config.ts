// The public marketing site. It extends the shared Wildcard UI layer, so type,
// color roles, shape, motion, icons and buttons are exactly the app's; site.css
// holds only the marketing layout and the animated scenes. Every page is
// prerendered (`nuxt generate`) in English at / and Spanish at /es, and served as
// static assets. See docs/site.md.
import { siteIcons } from './app/utils/siteIcons';
import { site } from './app/utils/site';

export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  modules: ['@nuxtjs/i18n'],
  compatibilityDate: '2026-10-26',
  devtools: { enabled: false },
  css: ['~/assets/css/site.css'],
  // Site-only glyphs (Solar names outside the shared registry, connector logos)
  // join the layer's client bundle. Prerendering inlines every icon into the
  // HTML, so the static pages never call the Iconify API either.
  icon: {
    clientBundle: { icons: siteIcons },
    serverBundle: { collections: ['solar', 'logos', 'simple-icons'] },
  },
  // Title, description, Open Graph, <html lang>, hreflang and canonical tags are
  // set per locale in app.vue.
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=0c69391a81ea' },
      ],
    },
  },
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'es', language: 'es', name: 'Español', file: 'es.json' },
    ],
    // Absolute canonical and hreflang URLs.
    baseUrl: site.url,
    // The root page redirects once (client-side) to /es for a Spanish browser;
    // choosing a language with the switcher is remembered in this cookie.
    detectBrowserLanguage: { useCookie: true, cookieKey: 'wildcard_site_locale', redirectOn: 'root' },
  },
  nitro: {
    // Explicit, so Workers Builds (which Nitro may detect as a Cloudflare
    // environment) still emits plain static files into .output/public.
    preset: 'static',
    // es.html rather than es/index.html: the Worker's `auto-trailing-slash` asset
    // handling serves /es directly (the canonical and hreflang URL) instead of
    // redirecting it to /es/.
    prerender: { routes: ['/', '/es'], crawlLinks: true, failOnError: true, autoSubfolderIndex: false },
  },
  typescript: { strict: true },
});
