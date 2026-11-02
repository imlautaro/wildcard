// Technical documentation for Wildcard, built with Docus (a Nuxt layer over Nuxt
// Content and Nuxt UI). Pages live in content/en and content/es with identical
// trees. Every page is prerendered (`nuxt generate`) and served as static assets by
// the `wildcard-docs` Worker, so Docus server features (AI assistant, MCP server)
// are not available. See docs/infrastructure.md#docs-worker.
const siteUrl = 'https://wildcard-docs.imlautaro.workers.dev';

export default defineNuxtConfig({
  extends: ['docus'],
  modules: ['@nuxtjs/i18n'],
  compatibilityDate: '2026-10-26',
  devtools: { enabled: false },
  site: {
    name: 'Wildcard Docs',
    url: siteUrl,
  },
  // The MCP server needs a server runtime; this site is static.
  mcp: { enabled: false },
  // Cold image rendering competes with the full bilingual reference in CI.
  ogImage: { security: { renderTimeout: 60_000 } },
  i18n: {
    defaultLocale: 'en',
    locales: [
      { code: 'en', language: 'en-US', name: 'English' },
      { code: 'es', language: 'es', name: 'Español' },
    ],
  },
  nitro: {
    // Explicit, so Workers Builds (which Nitro may detect as a Cloudflare
    // environment) still emits plain static files into .output/public.
    preset: 'static',
    prerender: { crawlLinks: true, failOnError: true },
  },
});
