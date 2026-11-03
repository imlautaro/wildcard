// Publishes the Nuxt admin Worker built by `npm run build:admin`. Same guards as
// release-web.mjs; it has no migrations or secrets of its own.
import { releaseBuiltWorker } from './lib/release-assets.mjs';

releaseBuiltWorker({
  label: 'admin app', config: 'apps/admin/.output/server/wrangler.json',
  built: 'apps/admin/.output/server/wrangler.json', buildCommand: 'npm run build:admin',
});
