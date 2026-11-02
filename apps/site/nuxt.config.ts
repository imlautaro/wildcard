// The public marketing site. It extends the shared Wildcard UI layer, so type,
// color roles, shape, motion, icons and buttons are exactly the app's; site.css
// holds only the marketing layout and the animated scenes. Every page is
// prerendered (`nuxt generate`) and served as static assets. See docs/site.md.
import { siteIcons } from './app/utils/siteIcons';
import { site } from './app/utils/site';

export default defineNuxtConfig({
  extends: ['../../packages/ui'],
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
  app: {
    head: {
      title: `${site.name} — ${site.tagline}`,
      meta: [
        { name: 'description', content: site.description },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: `${site.name} — ${site.tagline}` },
        { property: 'og:description', content: site.description },
        { name: 'twitter:card', content: 'summary' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=0c69391a81ea' },
      ],
    },
  },
  nitro: {
    // Explicit, so Workers Builds (which Nitro may detect as a Cloudflare
    // environment) still emits plain static files into .output/public.
    preset: 'static',
    prerender: { routes: ['/'], crawlLinks: true, failOnError: true },
  },
  typescript: { strict: true },
});
