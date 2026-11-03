// Publishes the prerendered documentation site built by `npm run build:docs`. The docs
// Worker has static assets only: no script, binding, migration or secret.
import { releaseBuiltWorker } from './lib/release-assets.mjs';

releaseBuiltWorker({
  label: 'docs', config: 'apps/docs/wrangler.jsonc',
  built: 'apps/docs/.output/public/en.html', buildCommand: 'npm run build:docs',
});
