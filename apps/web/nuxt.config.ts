// The browser only talks to this Worker. Server routes forward /api/v1/* to the
// API Worker through a service binding and keep the session token in a cookie.
export default defineNuxtConfig({
  compatibilityDate: '2026-10-26',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Wildcard',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' },
        { name: 'theme-color', content: '#000000', media: '(prefers-color-scheme: dark)' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preload', href: '/fonts/Manrope.ttf', as: 'font', type: 'font/ttf', crossorigin: '' },
      ],
    },
  },
  runtimeConfig: {
    // Local development only. Production requires the API service binding.
    apiOrigin: 'http://localhost:8787',
  },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: { deployConfig: true, nodeCompat: true },
    routeRules: {
      '/**': { headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      } },
    },
  },
  typescript: { strict: true },
});
