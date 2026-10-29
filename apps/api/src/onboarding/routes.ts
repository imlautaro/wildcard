import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { onboardingOptions, parseOnboarding, type OnboardingStatus } from '../../../../shared/onboarding';

export type OnboardingRow = { input_json: string; status: OnboardingStatus['status']; photo_count: number; group_id: string | null };
export async function onboardingStatus(env: Env, owner: string): Promise<OnboardingStatus> {
  const row = await env.DB.prepare('SELECT input_json, status, photo_count, group_id FROM account_onboarding WHERE user_id = ?')
    .bind(owner).first<OnboardingRow>();
  const user = row ? null : await env.DB.prepare('SELECT onboarding_required AS required FROM user WHERE id = ?').bind(owner).first<{ required: number }>();
  return { status: row?.status ?? (user?.required === 0 ? 'complete' : 'pending'), photoCount: row?.photo_count ?? 0,
    groupID: row?.group_id ?? null, input: row ? JSON.parse(row.input_json) : null };
}
export async function dispatchOnboarding(env: Env, owner: string, retry = false) {
  const row = await env.DB.prepare('SELECT status FROM account_onboarding WHERE user_id = ?').bind(owner).first<{ status: string }>();
  if (!row || row.status === 'complete') return;
  const id = `onboarding-${owner}`;
  // The single immutable Workflow ID arbitrates concurrent submissions and recovery.
  try { await env.ONBOARDING_WORKFLOW.create({ id, params: { owner } }); }
  catch {
    const instance = await env.ONBOARDING_WORKFLOW.get(id);
    const state = await instance.status();
    if (retry && ['errored', 'terminated'].includes(state.status)) await instance.restart();
    else if (['errored', 'terminated'].includes(state.status)) {
      await env.DB.prepare("UPDATE account_onboarding SET status = 'failed', updated_at = ? WHERE user_id = ? AND status != 'complete'")
        .bind(Date.now(), owner).run();
    }
  }
}
export async function recoverOnboarding(env: Env) {
  const { results } = await env.DB.prepare("SELECT user_id FROM account_onboarding WHERE status IN ('queued', 'generating') ORDER BY updated_at LIMIT 10")
    .all<{ user_id: string }>();
  for (const row of results) {
    try { await dispatchOnboarding(env, row.user_id); }
    catch { console.error(JSON.stringify({ event: 'onboarding_dispatch_unavailable' })); }
  }
}
const onboarding = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
onboarding.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  await next();
});
onboarding.get('/options', c => c.json(onboardingOptions));
onboarding.get('/', async c => c.json(await onboardingStatus(c.env, c.get('owner'))));
onboarding.post('/', bodyLimit({ maxSize: 4096 }), async c => {
  const owner = c.get('owner');
  const admission = await admitAuthRequest(c.env.DB, owner, 'onboarding-start', 6);
  if (!admission.allowed) return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  const required = await c.env.DB.prepare('SELECT onboarding_required AS required FROM user WHERE id = ?').bind(owner).first<{ required: number }>();
  if (!required?.required) return c.json({ error: 'Onboarding is already complete or unavailable for this account.' }, 409);
  const body: unknown = await c.req.json().catch(() => null);
  // Existing submissions are immutable, including legacy setups without age.
  const existing = await c.env.DB.prepare('SELECT user_id FROM account_onboarding WHERE user_id = ?').bind(owner).first();
  if (existing) {
    try { await dispatchOnboarding(c.env, owner, true); }
    catch { /* Cron recovers dispatch outages. */ }
    return c.json(await onboardingStatus(c.env, owner), 202);
  }
  const input = parseOnboarding(body);
  if (!input) return c.json({ error: 'Enter an age from 1 to 120, complete every field and accept shared memory to create your circle.' }, 422);
  // First submission freezes preferences; retries always reuse the original plan.
  await c.env.DB.prepare(`INSERT INTO account_onboarding (user_id, input_json, status, updated_at)
    VALUES (?, ?, 'queued', ?) ON CONFLICT(user_id) DO NOTHING`).bind(owner, JSON.stringify(input), Date.now()).run();
  try { await dispatchOnboarding(c.env, owner, true); }
  catch { /* Cron recovers a persisted submission after a dispatch outage. */ }
  return c.json(await onboardingStatus(c.env, owner), 202);
});
export default onboarding;
