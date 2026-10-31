import { fileURLToPath } from 'node:url';
import { appIcons } from './app/utils/icons';
import { themeScript } from './app/utils/theme';

// Wildcard UI: the Nuxt layer that apps/web and apps/admin extend. It owns the
// design tokens, the Material 3 component styles with the Wildcard customization
// on top, the press ripple, the icon set, the Manrope font and the shared Vue
// components. See docs/design-system.md.
const css = (file: string) => fileURLToPath(new URL(`./app/assets/css/${file}`, import.meta.url));

export default defineNuxtConfig({
  $meta: { name: 'ui' },
  modules: ['@nuxt/icon'],
  // Every rule in these files lives in a cascade layer (`ui.*`), so app styles,
  // which stay unlayered, always win regardless of load order.
  css: [css('tokens.css'), css('base.css'), css('components.css')],
  // Material Symbols ship in the client bundle only: no Iconify API requests and
  // no multi-megabyte collection inside the Workers.
  icon: {
    mode: 'svg',
    provider: 'none',
    fallbackToApi: false,
    serverBundle: false,
    clientBundle: { icons: Object.values(appIcons).flat(), scan: false },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      // Applies the saved appearance before the first paint and owns the
      // color-scheme and theme-color <meta> tags (kept out of Nuxt's head manager,
      // which would reset them); see app/utils/theme.ts.
      script: [{ innerHTML: themeScript }],
      link: [
        { rel: 'preload', href: '/fonts/Manrope.ttf', as: 'font', type: 'font/ttf', crossorigin: '' },
      ],
    },
  },
});
