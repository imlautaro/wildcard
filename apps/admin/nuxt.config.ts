// Super admin panel. Like apps/web, the browser only talks to this Worker: server
// routes forward an allowlist of /api/v1/* paths to the API's AdminAPI entrypoint
// through a service binding and keep the session token in a cookie. The design
// system comes from the shared Wildcard UI layer, as in apps/web.
export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  compatibilityDate: '2026-10-26',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'Wildcard Admin',
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=80154fe8f96b' },
      ],
    },
  },
  runtimeConfig: {
    // Local development only (`wrangler dev` with ADMIN_LOCAL_ROUTES=true).
    // Production requires the API service binding.
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
        'X-Robots-Tag': 'noindex, nofollow',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      } },
    },
  },
  typescript: { strict: true },
});
