// The browser only talks to this Worker. Server routes forward /api/v1/* to the
// API Worker through a service binding and keep the session token in a cookie.
// The design system (tokens, components, icons, ripple, font) comes from the
// shared Wildcard UI layer; main.css holds only this app's own styles.
export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  compatibilityDate: '2026-10-26',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Wildcard',
      titleTemplate: 'Wildcard',
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
    cloudflare: { deployConfig: true, nodeCompat: true },
    routeRules: {
      '/**': { headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'X-Frame-Options': 'DENY',
        'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      } },
    },
  },
  typescript: { strict: true },
});
