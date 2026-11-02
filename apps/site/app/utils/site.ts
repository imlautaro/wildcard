// Everything installation-specific on the marketing site lives here. Replace the
// URLs for an independent deployment; a null link hides its call to action.
export const site = {
  name: 'Wildcard',
  tagline: 'AI contacts that text you first',
  description:
    'Create AI contacts with their own name, face, personality and memory. They reach out on their own, '
    + 'remember what matters, and work together with you and the people you love. Open source, powered by Meta AI models.',
  // The web app. "Get started" buttons open it.
  appUrl: 'https://wildcard-web.imlautaro.workers.dev',
  // The source repository. While `repositoryPublic` is false the site says the code
  // is coming soon instead of linking to a private repository (which would 404).
  repositoryUrl: 'https://github.com/imlautaro/wildcard',
  repositoryPublic: false,
  // An App Store or TestFlight link for the iPhone app, when one exists.
  iosUrl: null as string | null,
} as const;

export const navigation = [
  { id: 'memory', label: 'Memory' },
  { id: 'together', label: 'Sharing' },
  { id: 'groups', label: 'Groups' },
  { id: 'for-you', label: 'For you' },
  { id: 'open-source', label: 'Open source' },
] as const;
