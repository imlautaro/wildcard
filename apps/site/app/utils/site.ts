// Everything installation-specific on the marketing site lives here. Replace the
// URLs for an independent deployment; a null link hides its call to action. The
// copy (tagline, description, section labels) lives in i18n/locales/<locale>.json.
export const site = {
  name: 'Wildcard',
  // The site's own public origin, without a trailing slash. Canonical and hreflang
  // links are absolute URLs on it (nuxt.config.ts `i18n.baseUrl`).
  url: 'https://wildcard-site.imlautaro.workers.dev',
  // The web app. "Get started" buttons open it.
  appUrl: 'https://wildcard-web.imlautaro.workers.dev',
  // Docs links append /en or /es to match the marketing site's language.
  docsUrl: 'https://wildcard-docs.imlautaro.workers.dev',
  // The source repository. While `repositoryPublic` is false the site says the code
  // is coming soon instead of linking to a private repository (which would 404).
  repositoryUrl: 'https://github.com/imlautaro/wildcard',
  repositoryPublic: true,
  // An App Store or TestFlight link for the iPhone app, when one exists.
  iosUrl: null as string | null,
} as const;

// Section anchors on the landing page; labels are the `nav.items.<key>` messages.
export const navigation = [
  { id: 'memory', key: 'memory' },
  { id: 'together', key: 'together' },
  { id: 'groups', key: 'groups' },
  { id: 'for-you', key: 'forYou' },
  { id: 'open-source', key: 'openSource' },
] as const;
