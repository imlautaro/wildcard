import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parsePersonality } from '../../../../shared/personality';
import { generateIdentity } from '../contacts/generation';
import { readPersonality } from './profile';
import { admitAuthRequest } from '../lib/auth-rate-limit';

const routes = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
const access = (db: D1Database, id: string, userID: string) => db.prepare(`SELECT c.agent_id AS agentID, a.owner_id AS ownerID
  FROM contact c JOIN contact_agent a ON a.id = c.agent_id WHERE c.id = ? AND c.user_id = ?`)
  .bind(id, userID).first<{ agentID: string; ownerID: string }>();

routes.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
routes.get('/', async c => {
  const agent = await access(c.env.DB, c.req.param('id')!, c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  return c.json(await readPersonality(c.env.DB, agent.agentID));
});
routes.post('/generate', bodyLimit({ maxSize: 1024 }), async c => {
  const owner = c.get('owner');
  const agent = await access(c.env.DB, c.req.param('id')!, owner);
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  if (agent.ownerID !== owner) return c.json({ error: 'Only the creator can generate personality' }, 403);
  const admission = await admitAuthRequest(c.env.DB, owner, 'personality-generate', 6);
  if (!admission.allowed) return c.json({ error: 'Too many attempts. Please try again later.' }, 429);
  const snapshot = await readPersonality(c.env.DB, agent.agentID);
  const contact = await c.env.DB.prepare('SELECT name FROM contact_agent WHERE id = ?').bind(agent.agentID).first<{ name: string }>();
  if (!contact) return c.json({ error: 'Contact not found' }, 404);
  try {
    const plan = await generateIdentity(c.env, owner, null, { name: contact.name, personality: snapshot.personality });
    const current = await access(c.env.DB, c.req.param('id')!, owner);
    if (!current || current.ownerID !== owner) return c.json({ error: 'Contact not found' }, 404);
    if ((await readPersonality(c.env.DB, agent.agentID)).revision !== snapshot.revision) return c.json({ error: 'Personality changed. Refresh before generating again.' }, 409);
    return c.json({ personality: plan.personality, revision: snapshot.revision });
  } catch {
    return c.json({ error: 'Could not generate personality. Your saved personality is unchanged. Please try again.' }, 502);
  }
});
routes.put('/', bodyLimit({ maxSize: 16_384, onError: c => c.json({ error: 'Personality is too large' }, 413) }), async c => {
  const agent = await access(c.env.DB, c.req.param('id')!, c.get('owner'));
  if (!agent) return c.json({ error: 'Contact not found' }, 404);
  if (agent.ownerID !== c.get('owner')) return c.json({ error: 'Only the creator can edit personality' }, 403);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'personality-update', 30);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many personality updates. Please wait a minute.' }, 429);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const profile = parsePersonality(body?.personality);
  if (!body || Object.keys(body).sort().join(',') !== 'personality,revision' || !profile
    || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {
    return c.json({ error: 'Provide a valid personality and revision. Contacts must be at least 18 years old.' }, 400);
  }
  // Older clients omit specialties; preserve the current value under the same revision check.
  const sent = body.personality as { traits?: object };
  if (!Object.hasOwn(sent, 'specialties') || !Object.hasOwn(sent.traits ?? {}, 'emoji') || !Object.hasOwn(sent.traits ?? {}, 'stickers')) {
    const current = (await readPersonality(c.env.DB, agent.agentID)).personality;
    if (!Object.hasOwn(sent, 'specialties')) profile.specialties = current.specialties;
    // Older clients omit the emoji trait too; keep the saved (or inferred) value.
    if (!Object.hasOwn(sent.traits ?? {}, 'emoji')) profile.traits.emoji = current.traits.emoji;
    // Likewise for the stickers trait.
    if (!Object.hasOwn(sent.traits ?? {}, 'stickers')) profile.traits.stickers = current.traits.stickers;
  }
  const saved = await c.env.DB.prepare(`INSERT INTO agent_personality (agent_id, profile_json, revision, updated_at)
    SELECT a.id, ?1, 1, ?2 FROM contact_agent a JOIN contact c ON c.agent_id = a.id
    WHERE a.id = ?3 AND a.owner_id = ?4 AND c.id = ?5 AND c.user_id = ?4 AND ?6 = 0
    ON CONFLICT(agent_id) DO NOTHING RETURNING revision`)
    .bind(JSON.stringify(profile), Date.now(), agent.agentID, c.get('owner'), c.req.param('id')!, body.revision).first();
  const updated = saved ?? await c.env.DB.prepare(`UPDATE agent_personality SET profile_json = ?1, revision = revision + 1, updated_at = ?2
    WHERE agent_id = ?3 AND revision = ?4 AND EXISTS (SELECT 1 FROM contact c JOIN contact_agent a ON a.id = c.agent_id
      WHERE c.id = ?5 AND c.user_id = ?6 AND a.owner_id = ?6 AND a.id = agent_personality.agent_id)
    RETURNING revision`).bind(JSON.stringify(profile), Date.now(), agent.agentID, body.revision, c.req.param('id')!, c.get('owner')).first();
  if (!updated) return c.json({ error: 'Personality changed. Refresh before saving again.' }, 409);
  return c.json(await readPersonality(c.env.DB, agent.agentID));
});
export default routes;
