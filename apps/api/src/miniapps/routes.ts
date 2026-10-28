import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { isRecord } from '../chat/meta';
import type { Connection } from '../mcp/client';
import { parseSpec } from './spec';
import { bindTools, contactConnectors, grantValid, miniAppColumns, resolve, runAction, validInputs, type GrantedTool, type MiniAppRow } from './runtime';

const routes = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
routes.use('*', bodyLimit({ maxSize: 8192, onError: c => c.json({ error: 'Request body too large' }, 413) }));
routes.use('*', async (c, next) => {
  if (!await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(c.req.param('id'), c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  if (!(await admitAuthRequest(c.env.DB, c.get('owner'), 'mini-apps', 120)).allowed) return c.json({ error: 'Too many requests' }, 429);
  await next();
});
function zone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return null; }
}
const find = (db: D1Database, id: string, contactID: string, owner: string) =>
  db.prepare(`SELECT ${miniAppColumns} FROM mini_app WHERE id = ? AND contact_id = ? AND user_id = ?`).bind(id, contactID, owner).first<MiniAppRow>();
function summary(app: MiniAppRow, connectors: Connection[]) {
  const { spec } = parseSpec(JSON.parse(app.specJSON));
  const tools = JSON.parse(app.toolsJSON) as GrantedTool[];
  const status = app.approvedRevision !== app.revision ? 'needs_review' : grantValid(app, connectors) ? 'enabled' : 'needs_reapproval';
  return { id: app.id, turnID: app.turnID, revision: app.revision, title: spec.title, subtitle: spec.subtitle ?? null, icon: spec.icon, status, inputs: spec.inputs,
    tools: tools.map(t => ({ connectionID: t.connectionID, connectionName: connectors.find(c => c.id === t.connectionID)?.name ?? 'Unavailable connection', toolName: t.toolName, role: t.role })),
    issues: app.lastError ? JSON.parse(app.lastError) : [], createdAt: app.createdAt, updatedAt: app.updatedAt };
}

routes.get('/', async c => {
  const contactID = c.req.param('id')!, owner = c.get('owner');
  const { results } = await c.env.DB.prepare(`SELECT ${miniAppColumns} FROM mini_app WHERE contact_id = ? AND user_id = ? ORDER BY updated_at DESC, id LIMIT 20`)
    .bind(contactID, owner).all<MiniAppRow>();
  const connectors = await contactConnectors(c.env.DB, contactID, owner);
  return c.json({ miniApps: results.map(app => summary(app, connectors)) });
});
routes.post('/:appID/approval', async c => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).sort().join(',') !== 'allowed,revision' || typeof body.allowed !== 'boolean' || !Number.isInteger(body.revision)) return c.json({ error: 'Provide revision and allowed.' }, 400);
  const contactID = c.req.param('id')!, owner = c.get('owner');
  const app = await find(c.env.DB, c.req.param('appID'), contactID, owner);
  if (!app) return c.json({ error: 'Mini app not found' }, 404);
  const connectors = await contactConnectors(c.env.DB, contactID, owner);
  if (body.allowed) {
    // Re-bind to the current catalog: approval covers exactly the definitions shown now.
    const stored = JSON.parse(app.toolsJSON) as GrantedTool[];
    const current = bindTools(stored, connectors);
    if (typeof current === 'string') return c.json({ error: `${current} Assign the connection and enable its tools in Connections, then review again.` }, 409);
    const updated = await c.env.DB.prepare('UPDATE mini_app SET approved_revision = revision, tools_json = ?, updated_at = ? WHERE id = ? AND revision = ? AND tools_json = ?')
      .bind(JSON.stringify(current), Date.now(), app.id, body.revision, app.toolsJSON).run();
    if (!updated.meta.changes) return c.json({ error: 'This mini app changed. Review it again.' }, 409);
  } else await c.env.DB.prepare('UPDATE mini_app SET approved_revision = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), app.id).run();
  const saved = await find(c.env.DB, app.id, contactID, owner);
  return saved ? c.json({ miniApp: summary(saved, connectors) }) : c.json({ error: 'Mini app not found' }, 404);
});
routes.post('/:appID/resolve', async c => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).some(key => !['inputs', 'timeZone'].includes(key))) return c.json({ error: 'Provide inputs and timeZone.' }, 400);
  const timeZone = zone(body.timeZone);
  if (!timeZone) return c.json({ error: 'Provide a valid time zone.' }, 400);
  const contactID = c.req.param('id')!, owner = c.get('owner');
  const app = await find(c.env.DB, c.req.param('appID'), contactID, owner);
  if (!app) return c.json({ error: 'Mini app not found' }, 404);
  const connectors = await contactConnectors(c.env.DB, contactID, owner);
  if (!grantValid(app, connectors)) return c.json({ error: 'Review and enable this mini app first.', code: 'REVIEW_REQUIRED' }, 409);
  const inputs = validInputs(parseSpec(JSON.parse(app.specJSON)).spec, body.inputs);
  if (!inputs) return c.json({ error: 'Invalid inputs.' }, 400);
  // Each load runs remote reads; keep it well below the general management budget.
  if (!(await admitAuthRequest(c.env.DB, owner, 'mini-app-resolve', 20)).allowed) return c.json({ error: 'Too many refreshes. Please wait a minute.' }, 429);
  const result = await resolve(c.env, app, connectors, inputs, timeZone);
  return c.json({ revision: app.revision, inputs, resolvedAt: Date.now(), ...result });
});
routes.post('/:appID/actions/:actionID', async c => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body) || Object.keys(body).some(key => !['executionID', 'revision', 'inputs', 'fields', 'timeZone'].includes(key))
    || typeof body.executionID !== 'string' || !uuid.test(body.executionID) || !Number.isInteger(body.revision)) return c.json({ error: 'Provide executionID and revision.' }, 400);
  const timeZone = zone(body.timeZone);
  if (!timeZone) return c.json({ error: 'Provide a valid time zone.' }, 400);
  const contactID = c.req.param('id')!, owner = c.get('owner');
  const app = await find(c.env.DB, c.req.param('appID'), contactID, owner);
  if (!app) return c.json({ error: 'Mini app not found' }, 404);
  const connectors = await contactConnectors(c.env.DB, contactID, owner);
  if (app.revision !== body.revision || !grantValid(app, connectors)) return c.json({ error: 'This mini app changed. Review it again.', code: 'REVIEW_REQUIRED' }, 409);
  if (!(await admitAuthRequest(c.env.DB, owner, 'mini-app-action', 10)).allowed) return c.json({ error: 'Too many actions. Please wait a minute.' }, 429);
  const outcome = await runAction(c.env, app, connectors, c.req.param('actionID'), body.executionID.toLowerCase(), body.inputs, body.fields, timeZone);
  return 'error' in outcome ? c.json({ error: outcome.error }, outcome.status as 400) : c.json(outcome);
});
routes.delete('/:appID', async c => {
  await c.env.DB.prepare('DELETE FROM mini_app WHERE id = ? AND contact_id = ? AND user_id = ?').bind(c.req.param('appID'), c.req.param('id'), c.get('owner')).run();
  return c.body(null, 204);
});
export default routes;
