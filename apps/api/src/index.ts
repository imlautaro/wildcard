import { deliverGroupPush } from './groups/push';
import { recoverGroups } from './groups/workflow';
import { cleanAttachments } from './chat/attachments';
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
    ctx.waitUntil(cleanAttachments(env));
    ctx.waitUntil(dispatchSchedules(env));
    ctx.waitUntil(recoverChats(env));
    ctx.waitUntil(recoverGroups(env));
    ctx.waitUntil(expirePresence(env.DB));
    ctx.waitUntil(recoverVisits(env));
    ctx.waitUntil(deliverPush(env));
    ctx.waitUntil(deliverGroupPush(env));
  },
} satisfies ExportedHandler<Env>;
