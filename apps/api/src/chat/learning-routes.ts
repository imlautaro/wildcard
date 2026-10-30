import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { learningSnapshot } from './learning';

export function learningRoutes(kind: 'contact' | 'group') {
  const routes = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
  routes.use('*', bodyLimit({ maxSize: 512, onError: c => c.json({ error: 'Request body too large' }, 413) }));
  routes.get('/', async c => {
    const snapshot = await learningSnapshot(c.env.DB, kind, c.req.param('id')!, c.get('owner'));
    c.header('Cache-Control', 'no-store');
    return snapshot ? c.json(snapshot) : c.json({ error: 'Conversation not found' }, 404);
  });
  routes.on(['PUT', 'DELETE'], '/', async c => {
    const id = c.req.param('id')!, userID = c.get('owner'), db = c.env.DB;
    if (!await learningSnapshot(db, kind, id, userID)) return c.json({ error: 'Conversation not found' }, 404);
    if (!(await admitAuthRequest(db, userID, 'learning-write', 30)).allowed) return c.json({ error: 'Too many requests' }, 429);
    const reset = c.req.method === 'DELETE';
    const value = reset ? null : await c.req.json<{ enabled?: unknown }>().catch(() => null);
    if (!reset && (!value || typeof value !== 'object' || Object.keys(value).join(',') !== 'enabled' || typeof value.enabled !== 'boolean')) {
      return c.json({ error: 'Provide only enabled as a boolean' }, 400);
    }
    const settings = kind === 'contact'
      ? db.prepare(`UPDATE contact SET learning_revision = learning_revision + 1,
          learning_enabled = CASE WHEN ?3 = 1 THEN learning_enabled ELSE ?4 END,
          learning_since = COALESCE((SELECT MAX(sequence) FROM chat_turn WHERE contact_id = ?1), 0)
          WHERE id = ?1 AND user_id = ?2 AND clearing = 0`).bind(id, userID, reset ? 1 : 0, value?.enabled === true ? 1 : 0)
      : db.prepare(`UPDATE group_member SET learning_revision = learning_revision + 1,
          learning_enabled = CASE WHEN ?3 = 1 THEN learning_enabled ELSE ?4 END,
          learning_since = COALESCE((SELECT MAX(sequence) FROM group_message WHERE group_id = ?1), 0)
          WHERE group_id = ?1 AND user_id = ?2 AND EXISTS (SELECT 1 FROM chat_group WHERE id = ?1 AND clearing = 0)`)
        .bind(id, userID, reset ? 1 : 0, value?.enabled === true ? 1 : 0);
    await db.batch([settings, db.prepare('DELETE FROM conversation_learning WHERE scope_key = ? AND user_id = ?').bind(`${kind}:${id}`, userID)]);
    c.header('Cache-Control', 'no-store');
    const snapshot = await learningSnapshot(db, kind, id, userID);
    return snapshot ? c.json(snapshot) : c.json({ error: 'Conversation not found' }, 404);
  });
  return routes;
}
