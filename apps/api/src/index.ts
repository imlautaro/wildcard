// Initialize schema constructors before imports that transitively load auth or MCP.
import './lib/schema-runtime';
import { cleanResources } from './chat/cleanup';
import { pruneLearning } from './chat/learning';
import { dispatchTasks } from './tasks/dispatch';
import { dispatchMonitors } from './monitors/dispatch';
import { dispatchHome } from './home/workflow';
import { recoverContactGeneration } from './contacts/generation';
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
import { expireLinkPreviews } from './links/preview';
import { deliverPush } from './push/delivery';
import app from './app';
import adminApp from './admin/app';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { recoverChats } from './chat/dispatch';
import { prunePersonalityEvents } from './personality/engine';

export { OnboardingWorkflow } from './onboarding/workflow';

export { ChatWorkflow } from './chat/workflow';

// Admin API for apps/admin. A named entrypoint is reachable only through a
// service binding that names it, never from the public workers.dev origin.
export class AdminAPI extends WorkerEntrypoint<Env> {
  override fetch(request: Request) {
    return adminApp.fetch(request, this.env, this.ctx);
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recoverOnboarding(env));
    ctx.waitUntil(recoverContactGeneration(env));
    ctx.waitUntil(cleanOAuthFlows(env));
    ctx.waitUntil(prunePersonalityEvents(env.DB));
    ctx.waitUntil(pruneLearning(env.DB));
    ctx.waitUntil(cleanResources(env));
    ctx.waitUntil(cleanAttachments(env));
    ctx.waitUntil(dispatchSchedules(env));
    ctx.waitUntil(dispatchTasks(env));
    ctx.waitUntil(dispatchMonitors(env));
    ctx.waitUntil(dispatchHome(env));
    ctx.waitUntil(dispatchInitiatives(env));
    ctx.waitUntil(recoverChats(env));
    ctx.waitUntil(recoverGroups(env));
    ctx.waitUntil(dispatchGroupRequests(env));
    ctx.waitUntil(expirePresence(env.DB));
    ctx.waitUntil(expireLinkPreviews(env).catch(() => console.error(JSON.stringify({ event: 'link_preview_expiry_deferred' }))));
    ctx.waitUntil(deliverPush(env));
    ctx.waitUntil(deliverRemoteNative(env));
    ctx.waitUntil(deliverGroupPush(env));
  },
} satisfies ExportedHandler<Env>;
