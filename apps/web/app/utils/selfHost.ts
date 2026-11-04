// Where the waitlist sends people who would rather run their own copy
// (docs/authentication.md#early-access-waitlist). Forks can point these at their
// own repository and Docs. The deploy button leads, as on the marketing site.
export const selfHost = {
  deployUrl: 'https://deploy.workers.cloudflare.com/?url=https://github.com/imlautaro/wildcard',
  guideUrl: (locale: string) => `https://wildcard-docs.imlautaro.workers.dev/${locale === 'es' ? 'es' : 'en'}/self-host/deploy`,
};
