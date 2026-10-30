// Local test entrypoint only. Never referenced by a production Wrangler config.
import '../src/lib/schema-runtime';
import app from '../src/app';
import adminApp from '../src/admin/app';
import { dispatchOnboarding } from '../src/onboarding/routes';
import { dispatchContactGeneration } from '../src/contacts/generation';
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { clearContact, clearGroup, cleanResources } from '../src/chat/cleanup';
import { dispatchInitiatives } from '../src/chat/initiative';
import { dispatchAgent } from '../src/chat/dispatch';
import { retainedGroupMemories, retainedGroupSelf } from '../src/chat/retained-memory';
import { readMemories } from '../src/chat/memory';
import { readAgentMemories } from '../src/chat/agent-memory';
import { discardChatObject } from '../src/chat/object-storage';

type Faults = {
  objects?: string[]; lists?: string[]; workflows?: string[];
  createRace?: { contact: string; user: string; fail?: boolean };
  accountCreateRace?: { user: string; fail?: boolean };
  requeue?: { key: string; scope: string; fail?: boolean };
};
function failingEnvironment(env: Env, faults: Faults): Env {
  const wrap = <T extends object>(target: T, methods: Record<string, (...args: never[]) => unknown>): T =>
    new Proxy(target, { get(value, key) {
      if (methods[String(key)]) return methods[String(key)];
      const member: unknown = Reflect.get(value,key);
      return typeof member === 'function' ? member.bind(value) : member;
    } });
  const storage = wrap(env.CONTACT_PHOTOS, {
    async delete(keys: string | string[]) {
      const list = typeof keys === 'string' ? [keys] : keys;
      if (faults.requeue && list.includes(faults.requeue.key)) {
        await discardChatObject(env, faults.requeue.key, faults.requeue.scope);
        if (faults.requeue.fail) throw new Error('Injected delete failure after a newer enqueue');
      }
      if (list.some(key => faults.objects?.includes(key))) throw new Error('Injected object deletion failure');
      return env.CONTACT_PHOTOS.delete(keys);
    },
    async list(options: R2ListOptions) {
      if (faults.lists?.includes(options.prefix ?? '')) throw new Error('Injected prefix listing failure');
      return env.CONTACT_PHOTOS.list(options);
    },
  });
  const workflows = <P,>(binding: Workflow<P>) => wrap(binding, {
    async create(options: Parameters<Workflow<P>['create']>[0]) {
      if (faults.createRace) await clearContact(env,faults.createRace.contact,faults.createRace.user,true,0);
      if (faults.accountCreateRace) await env.DB.prepare('DELETE FROM user WHERE id=?').bind(faults.accountCreateRace.user).run();
      const instance = await binding.create(options);
      if (faults.createRace?.fail || faults.accountCreateRace?.fail) throw new Error('Injected lost Workflow create acknowledgement');
      return instance;
    },
    async get(id: string) {
      const instance = await binding.get(id);
      return wrap(instance, { async delete() {
        if (faults.workflows?.includes(id)) throw new Error('Injected workflow deletion failure');
        return instance.delete();
      } });
    },
  });
  return { ...env, CONTACT_PHOTOS: storage, CHAT_WORKFLOW: workflows(env.CHAT_WORKFLOW), ONBOARDING_WORKFLOW: workflows(env.ONBOARDING_WORKFLOW) };
}
export class FixtureWorkflow extends WorkflowEntrypoint<Env, { complete?: boolean }> {
  override async run(event: WorkflowEvent<{ complete?: boolean }>, step: WorkflowStep) {
    await step.do('fixture-checkpoint', async () => {
      await this.env.DB.prepare('INSERT INTO fixture_workflow_checkpoint(id) VALUES(?) ON CONFLICT DO NOTHING').bind(event.instanceId).run();
      return { fixture: event.instanceId };
    });
    if (!event.payload.complete) await step.sleep('fixture-wait', '1 day');
    return { fixture: event.instanceId, done: true };
  }
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const faults = JSON.parse(request.headers.get('x-fixture-faults') ?? '{}') as Faults;
    const wrapped = failingEnvironment(env, faults);
    if (url.pathname.startsWith('/api/')) {
      const pending: Promise<unknown>[] = [];
      const tracked = new Proxy(ctx, { get(target,key) {
        if (key === 'waitUntil') return (promise: Promise<unknown>) => { pending.push(promise); ctx.waitUntil(promise); };
        const value = Reflect.get(target,key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const response = url.pathname.startsWith('/api/v1/admin/')
        ? await adminApp.fetch(request, { ...wrapped, SUPER_ADMIN_USER_IDS: 'fixture-outsider' }, tracked)
        : await app.fetch(request, wrapped, tracked);
      await Promise.allSettled(pending);
      return response;
    }
    const body = await request.json<{ action: string; id: string; userID?: string; memory?: boolean; revision?: number; group?: boolean; complete?: boolean; contributor?: boolean; generation?: boolean }>();
    try {
      if (body.action === 'initiative') await dispatchInitiatives({ ...wrapped, META_API_KEY: 'fictional-test-key-no-network' });
      if (body.action === 'dispatch') await dispatchAgent(wrapped,body.id);
      if (body.action === 'dispatch-onboarding') await dispatchOnboarding(wrapped,body.userID!);
      if (body.action === 'dispatch-generation') await dispatchContactGeneration(wrapped,body.userID!,body.id);
      if (body.action === 'memories') return Response.json({
        human: body.group ? await retainedGroupMemories(env.DB,body.id,body.contributor??false,{groupID: 'fixture-group',userID:body.userID!})
          : await readMemories(env.DB,{contactID:body.id,userID:body.userID!,beforeSequence:Number.MAX_SAFE_INTEGER,privateConversation:true,contributorModel:body.contributor,processingUserID:body.userID}),
        self: await readAgentMemories(env.DB,body.group?'fixture-contact':body.id,body.contributor??false,body.userID!,body.group?{groupID:'fixture-group'}:{contactID:body.id}),
      });
      if (body.action === 'clean') await cleanResources(wrapped, body.id || undefined);
      if (body.action === 'clear') {
        if (body.group) await clearGroup(wrapped, body.id, body.memory ?? false, body.revision ?? 0);
        else await clearContact(wrapped, body.id, body.userID!, body.memory ?? false, body.revision ?? 0);
      }
      if (body.action === 'workflow-create') {
        if (body.generation) {
          const params = { owner: body.userID!, complete: body.complete };
          await env.ONBOARDING_WORKFLOW.create({ id: body.id, params });
        } else {
          const params = { turnID: body.id, attempt: 1, complete: body.complete };
          await env.CHAT_WORKFLOW.create({ id: body.id, params });
        }
      }
      if (body.action === 'workflow-pause') await (await env.CHAT_WORKFLOW.get(body.id)).pause();
      if (body.action === 'workflow-status') return Response.json(await (await (body.generation ? env.ONBOARDING_WORKFLOW : env.CHAT_WORKFLOW).get(body.id)).status());
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  },
};
