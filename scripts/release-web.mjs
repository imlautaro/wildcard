// Publishes the Nuxt web Worker built by `npm run build:web`. It has no migrations
// or secrets; the API Worker owns D1, R2, and every credential.
import { releaseBuiltWorker } from './lib/release-assets.mjs';

releaseBuiltWorker({
  label: 'web app', config: 'apps/web/.output/server/wrangler.json',
  built: 'apps/web/.output/server/wrangler.json', buildCommand: 'npm run build:web',
});
