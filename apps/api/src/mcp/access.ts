import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { isRecord } from '../chat/meta';

type Scope = { Bindings: Env; Variables: { owner: string } };
function accessRoutes(group: boolean) {
  const routes = new Hono<Scope>();
  routes.use('*', async (c, next) => {
    const session = await readBearerSession(c.env, c.req.raw.headers);
    if (!session) return c.json({ error: 'Unauthorized' }, 401);
    c.set('owner', session.user.id);
    const resource = group
      ? await c.env.DB.prepare('SELECT group_id FROM group_member WHERE group_id = ? AND user_id = ?').bind(c.req.param('groupID'), session.user.id).first()
      : await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(c.req.param('contactID'), session.user.id).first();
    if (!resource) return c.json({ error: 'Resource not found' }, 404);
    if (!(await admitAuthRequest(c.env.DB, session.user.id, 'mcp-management', 30)).allowed) return c.json({ error: 'Too many attempts. Please wait a minute.' }, 429);
    await next();
  });
  routes.use('*', bodyLimit({ maxSize: 1000, onError: c => c.json({ error: 'Request body too large' }, 413) }));
  routes.get('/', async c => {
    const owner = c.get('owner');
    const { results } = group
      ? await c.env.DB.prepare(`SELECT m.id, m.name, a.id AS agentID, COALESCE(ct.alias, a.name) AS agentName,
          EXISTS (SELECT 1 FROM mcp_group_access x WHERE x.group_id = ga.group_id AND x.agent_id = ga.agent_id AND x.connection_id = m.id) AS granted
        FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id AND a.owner_id = ?2
        JOIN contact ct ON ct.agent_id = a.id AND ct.user_id = ?2
        JOIN mcp_contact_access ca ON ca.contact_id = ct.id JOIN mcp_connector m ON m.id = ca.connection_id AND m.user_id = ?2
        WHERE ga.group_id = ?1 AND ga.added_by = ?2 ORDER BY COALESCE(ct.alias, a.name), m.name`).bind(c.req.param('groupID'), owner).all()
      : await c.env.DB.prepare(`SELECT m.id, m.name,
          EXISTS (SELECT 1 FROM mcp_contact_access x WHERE x.contact_id = ?1 AND x.connection_id = m.id) AS granted
        FROM mcp_connector m WHERE m.user_id = ?2 ORDER BY m.name, m.id`).bind(c.req.param('contactID'), owner).all();
    return c.json({ connections: results });
  });
  routes.patch('/:connectionID', async c => {
    const b: unknown = await c.req.json();
    if (!isRecord(b) || typeof b.allowed !== 'boolean' || Object.keys(b).sort().join(',') !== (group ? 'agentID,allowed' : 'allowed') || (group && typeof b.agentID !== 'string')) return c.json({ error: 'Provide access permission.' }, 400);
    const owner = c.get('owner'), id = c.req.param('connectionID'), now = crypto.randomUUID();
    const connector = await c.env.DB.prepare('SELECT id FROM mcp_connector WHERE id = ? AND user_id = ?').bind(id, owner).first();
    if (!connector) return c.json({ error: 'Connector not found' }, 404);
    if (group) {
      const groupID = c.req.param('groupID')!;
      const eligible = await c.env.DB.prepare(`SELECT ga.agent_id FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id
        JOIN contact ct ON ct.agent_id = a.id AND ct.user_id = a.owner_id
        JOIN mcp_contact_access ca ON ca.contact_id = ct.id AND ca.connection_id = ?4
        WHERE ga.group_id = ?1 AND ga.agent_id = ?2 AND ga.added_by = ?3 AND a.owner_id = ?3`)
        .bind(groupID, b.agentID, owner, id).first();
      if (!eligible) return c.json({ error: 'Only the bot owner who added it may grant its assigned connectors.' }, 403);
      if (b.allowed) {
        await c.env.DB.batch([
          c.env.DB.prepare(`INSERT OR IGNORE INTO mcp_group_access (group_id, agent_id, connection_id, user_id, generation)
            SELECT ga.group_id, ga.agent_id, ?4, ?3, ?5 FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id
            JOIN contact ct ON ct.agent_id = a.id AND ct.user_id = ?3 JOIN mcp_contact_access ca ON ca.contact_id = ct.id AND ca.connection_id = ?4
            JOIN mcp_connector m ON m.id = ca.connection_id AND m.user_id = ?3
            WHERE ga.group_id = ?1 AND ga.agent_id = ?2 AND ga.added_by = ?3 AND a.owner_id = ?3`)
            .bind(groupID, b.agentID, owner, id, now),
          c.env.DB.prepare('INSERT OR IGNORE INTO mcp_private_group SELECT group_id FROM mcp_group_access WHERE group_id = ? AND agent_id = ? AND connection_id = ?').bind(groupID, b.agentID, id),
        ]);
      } else await c.env.DB.prepare('DELETE FROM mcp_group_access WHERE group_id = ? AND agent_id = ? AND connection_id = ? AND user_id = ?').bind(groupID, b.agentID, id, owner).run();
    } else {
      const contactID = c.req.param('contactID')!;
      if (b.allowed) {
        const results = await c.env.DB.batch([
          c.env.DB.prepare(`INSERT OR IGNORE INTO mcp_contact_access (contact_id, connection_id, generation)
            SELECT ct.id, m.id, ?4 FROM contact ct JOIN mcp_connector m ON m.user_id = ct.user_id
            WHERE ct.id = ?1 AND ct.user_id = ?2 AND m.id = ?3
            AND (SELECT COUNT(*) FROM mcp_contact_access WHERE contact_id = ct.id) < 4
            AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = ct.id AND status IN ('queued', 'running'))`).bind(contactID, owner, id, now),
          c.env.DB.prepare('INSERT OR IGNORE INTO mcp_private_contact SELECT contact_id FROM mcp_contact_access WHERE contact_id = ? AND connection_id = ?').bind(contactID, id),
          c.env.DB.prepare('SELECT contact_id FROM mcp_contact_access WHERE contact_id = ? AND connection_id = ?').bind(contactID, id),
        ]);
        if (!results[2].results.length) return c.json({ error: 'Wait for the current reply to finish. Each contact supports four connectors.' }, 409);
      } else await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM mcp_group_access WHERE connection_id = ?1 AND user_id = ?2
          AND agent_id IN (SELECT agent_id FROM contact WHERE id = ?3 AND user_id = ?2)`).bind(id, owner, contactID),
        c.env.DB.prepare('DELETE FROM mcp_contact_access WHERE contact_id = ? AND connection_id = ?').bind(contactID, id),
      ]);
    }
    return c.json({ ok: true });
  });
  return routes;
}
export const contactAccess = accessRoutes(false);
export const groupAccess = accessRoutes(true);
