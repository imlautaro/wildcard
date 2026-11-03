// Shows, and with --create creates, the account resources the API Worker needs
// (npm run infra:provision). Releases do the same automatically, so running this is
// optional: use it to check the account and credential before the first push.
// Nothing is deployed or migrated, and versioned files are never edited.
import { describeInstance, resolveApiInstance } from './lib/instance.mjs';

const create = process.argv.includes('--create');
const instance = await resolveApiInstance({ create });
console.log(describeInstance(instance));
if (instance.missing.length) {
  console.log(`\nMissing: ${instance.missing.join(', ')}. Run \`npm run infra:provision -- --create\` or let the first release create them.`);
} else console.log('\nAll resources exist. Workflows and the Cron trigger are created by the release.');
