export default defineAppConfig({
  seo: {
    titleTemplate: '%s · Wildcard Docs',
    title: 'Wildcard Docs',
    description: 'Technical documentation for Wildcard: architecture, Cloudflare services, local development, configuration and releases.',
  },
  header: {
    title: 'Wildcard Docs',
    logo: {
      light: '/favicon.svg',
      dark: '/favicon.svg',
      alt: 'Wildcard',
      favicon: '/favicon.svg',
    },
  },
  ui: {
    colors: {
      primary: 'blue',
      neutral: 'zinc',
    },
  },
  navigation: {
    sub: 'header',
  },
  // The repository is private: "Edit this page" links would return 404.
  github: false,
  socials: {},
});
