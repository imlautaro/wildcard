// Initialize schema constructors before imports that transitively load auth or MCP.
import './lib/schema-runtime';
import { recoverOnboarding } from './onboarding/routes';
import { deliverRemoteNative } from './native/remote';
import { dispatchInitiatives } from './chat/initiative';
import { cleanOAuthFlows } from './mcp/oauth';
import { deliverGroupPush } from './groups/push';
import { dispatchGroupRequests } from './groups/request-results';
import { recoverGroups } from './groups/workflow';
import { cleanAttachments } from './chat/attachments';
import { dispatchSchedules } from './schedules/dispatch';
import { expirePresence } from './chat/presence';
import { deliverPush } from './push/delivery';
import app from './app';
import { recoverChats } from './chat/dispatch';
import { prunePersonalityEvents } from './personality/engine';

export { OnboardingWorkflow } from './onboarding/workflow';

export { ChatWorkflow } from './chat/workflow';

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recoverOnboarding(env));
    ctx.waitUntil(cleanOAuthFlows(env));
    ctx.waitUntil(prunePersonalityEvents(env.DB));
    ctx.waitUntil(cleanAttachments(env));
    ctx.waitUntil(dispatchSchedules(env));
    ctx.waitUntil(dispatchInitiatives(env));
    ctx.waitUntil(recoverChats(env));
    ctx.waitUntil(recoverGroups(env));
    ctx.waitUntil(dispatchGroupRequests(env));
    ctx.waitUntil(expirePresence(env.DB));
    ctx.waitUntil(deliverPush(env));
    ctx.waitUntil(deliverRemoteNative(env));
    ctx.waitUntil(deliverGroupPush(env));
  },
} satisfies ExportedHandler<Env>;
