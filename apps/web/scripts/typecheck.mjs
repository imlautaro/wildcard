// vue-tsc cannot load the TypeScript 7 compiler used by the API workspace, so the
// web app type-checks with an aliased TypeScript 6 compiler. Static only; emits nothing.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
process.argv = [process.argv[0], 'vue-tsc', '-b', '--noEmit'];
require('vue-tsc').run(require.resolve('typescript6/lib/tsc'));
