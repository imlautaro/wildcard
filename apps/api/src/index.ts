import { dispatchSchedules } from './schedules/dispatch';
import { recoverVisits } from './chat/visits';
import { expirePresence } from './chat/presence';
import { deliverPush } from './push/delivery';
import app from './app';
import { recoverChats } from './chat/dispatch';

export { ChatWorkflow } from './chat/workflow';

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatchSchedules(env));
    ctx.waitUntil(recoverChats(env));
    ctx.waitUntil(expirePresence(env.DB));
    ctx.waitUntil(recoverVisits(env));
    ctx.waitUntil(deliverPush(env));
  },
} satisfies ExportedHandler<Env>;
