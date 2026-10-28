import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { contactModelAllowed } from '../chat/consent';

const routes = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const access = `native_action.turn_id IN (SELECT t.id FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
  WHERE t.contact_id = ?1 AND t.user_id = ?2
  AND json_extract(t.native_context_json, '$.deviceID') = ?3)`;
const columns = `id, turn_id AS turnID, kind, payload_json AS payloadJSON,
  CASE WHEN status = 'pending' AND expires_at <= ?4 THEN 'expired' ELSE status END AS status,
  execution_id AS executionID, created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt`;
routes.use('*', bodyLimit({ maxSize: 1024, onError: c => c.json({ error: 'Request body too large' }, 413) }));
routes.use('*', async (c, next) => {
  if (!await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  if (!uuid.test(c.req.query('deviceID') ?? '')) return c.json({ error: 'Provide a device UUID' }, 400);
  if (!await contactModelAllowed(c.env, c.req.param('id')!, c.get('owner'))) return c.json({ error: 'Contact consent required' }, 403);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'native-actions', 120);
  if (!admission.allowed) return c.json({ error: 'Too many requests' }, 429);
  await next();
});
routes.get('/', async c => {
  const { results } = await c.env.DB.prepare(`SELECT ${columns} FROM native_action WHERE ${access}
    ORDER BY created_at DESC, id DESC LIMIT 50`).bind(c.req.param('id'), c.get('owner'), c.req.query('deviceID')!.toLowerCase(), Date.now()).all();
  return c.json({ actions: results });
});
routes.post('/:actionID', async c => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'executionID,status'
    || typeof body.executionID !== 'string' || !uuid.test(body.executionID)
    || !['running','completed','failed','cancelled','unknown'].includes(String(body.status))) return c.json({ error: 'Provide an execution UUID and action status' }, 400);
  const now = Date.now();
  const running = body.status === 'running';
  const row = await c.env.DB.prepare(`UPDATE native_action SET status = ?5, execution_id = ?6, updated_at = ?4
    WHERE ${access} AND id = ?7 AND ${running ? "status = 'pending' AND expires_at > ?4" : body.status === 'cancelled' ? "(status = 'pending' OR (status = 'running' AND execution_id = ?6))" : "status = 'running' AND execution_id = ?6"}
    RETURNING ${columns}`).bind(c.req.param('id'), c.get('owner'), c.req.query('deviceID')!.toLowerCase(), now,
      body.status, body.executionID.toLowerCase(), c.req.param('actionID')).first();
  // Do not replay a claim: an uncertain claim must never cause a second device action.
  return row ? c.json({ action: row }) : c.json({ error: 'Action changed, expired, or already claimed. Refresh its status; do not repeat execution.' }, 409);
});
export default routes;
