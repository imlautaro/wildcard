// Publishes the prerendered marketing site built by `npm run build:site`. The site
// Worker has static assets only: no script, binding, migration or secret.
import { releaseBuiltWorker } from './lib/release-assets.mjs';

releaseBuiltWorker({
  label: 'site', config: 'apps/site/wrangler.jsonc',
  built: 'apps/site/.output/public/index.html', buildCommand: 'npm run build:site',
});
