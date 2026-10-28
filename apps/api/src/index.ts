import './lib/schema-runtime';
import { dispatchInitiatives } from './chat/initiative';
import { cleanOAuthFlows } from './mcp/oauth';
import { deliverGroupPush } from './groups/push';
import { dispatchGroupRequests } from './groups/request-results';
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
    ctx.waitUntil(cleanOAuthFlows(env));
    ctx.waitUntil(cleanAttachments(env));
    ctx.waitUntil(dispatchSchedules(env));
    ctx.waitUntil(dispatchInitiatives(env));
    ctx.waitUntil(recoverChats(env));
    ctx.waitUntil(recoverGroups(env));
    ctx.waitUntil(dispatchGroupRequests(env));
    ctx.waitUntil(expirePresence(env.DB));
    ctx.waitUntil(recoverVisits(env));
    ctx.waitUntil(deliverPush(env));
    ctx.waitUntil(deliverGroupPush(env));
  },
} satisfies ExportedHandler<Env>;
