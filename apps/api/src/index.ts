import app from './app';
import { recoverChats } from './chat/dispatch';

export { ChatWorkflow } from './chat/workflow';

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recoverChats(env));
  },
} satisfies ExportedHandler<Env>;
