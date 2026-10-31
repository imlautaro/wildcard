import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { isRecord } from '../chat/meta';
import type { Connection } from '../mcp/client';
import { parseSpec } from './spec';
import { bindTools, contactConnectors, grantValid, miniAppColumns, resolve, runAction, runStateEdit, validInputs, type GrantedTool, type MiniAppRow } from './runtime';

type Variables = { owner: string; scope: Scope };
// Which rows a request can reach: one person's private chat, or every app of a group.
type Scope = { sql: string; values: string[]; contactID: string | null; owner: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function zone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return value; } catch { return null; }
}
const find = (db: D1Database, id: string, scope: Scope) =>
  db.prepare(`SELECT ${miniAppColumns} FROM mini_app WHERE id = ? AND ${scope.sql}`).bind(id, ...scope.values).first<MiniAppRow>();
// Group apps never use connectors, so they have no grant beyond their revision.
const connectorsFor = (db: D1Database, scope: Scope) => scope.contactID ? contactConnectors(db, scope.contactID, scope.owner) : Promise.resolve([]);
function summary(app: MiniAppRow, connectors: Connection[]) {
  const { spec } = parseSpec(JSON.parse(app.specJSON));
  const tools = JSON.parse(app.toolsJSON) as GrantedTool[];
  const status = app.approvedRevision !== app.revision ? 'needs_review' : grantValid(app, connectors) ? 'enabled' : 'needs_reapproval';
  // Tab titles and icons let clients draw the app's tab bar before its data loads.
  return { id: app.id, turnID: app.turnID, replyID: app.replyID, revision: app.revision, title: spec.title, subtitle: spec.subtitle ?? null, icon: spec.icon, status, inputs: spec.inputs,
    tabs: spec.tabs?.map(tab => ({ id: tab.id, title: tab.title, icon: tab.icon })) ?? [],
    tools: tools.map(t => ({ connectionID: t.connectionID, connectionName: connectors.find(c => c.id === t.connectionID)?.name ?? 'Unavailable connection', toolName: t.toolName, role: t.role })),
    issues: app.lastError ? JSON.parse(app.lastError) : [], createdAt: app.createdAt, updatedAt: app.updatedAt };
}

/**
 * Mini app routes under `/contacts/:id/mini-apps` (your private chat with that contact)
 * and `/groups/:id/mini-apps` (shared by the group; membership is checked by the parent router).
 */
export function miniAppRoutes(kind: 'contact' | 'group') {
  const routes = new Hono<{ Bindings: Env; Variables: Variables }>();
  routes.use('*', bodyLimit({ maxSize: 8192, onError: c => c.json({ error: 'Request body too large' }, 413) }));
  routes.use('*', async (c, next) => {
    const id = c.req.param('id')!, owner = c.get('owner');
    if (kind === 'contact' && !await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?').bind(id, owner).first()) return c.json({ error: 'Contact not found' }, 404);
    if (!(await admitAuthRequest(c.env.DB, owner, 'mini-apps', 120)).allowed) return c.json({ error: 'Too many requests' }, 429);
    c.set('scope', kind === 'contact' ? { sql: 'contact_id = ? AND user_id = ?', values: [id, owner], contactID: id, owner }
      : { sql: 'group_id = ?', values: [id], contactID: null, owner });
    await next();
  });
  routes.get('/', async c => {
    const scope = c.get('scope');
    const { results } = await c.env.DB.prepare(`SELECT ${miniAppColumns} FROM mini_app WHERE ${scope.sql} ORDER BY updated_at DESC, id LIMIT 20`)
      .bind(...scope.values).all<MiniAppRow>();
    const connectors = await connectorsFor(c.env.DB, scope);
    return c.json({ miniApps: results.map(app => summary(app, connectors)) });
  });
  routes.post('/:appID/approval', async c => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body) || Object.keys(body).sort().join(',') !== 'allowed,revision' || typeof body.allowed !== 'boolean' || !Number.isInteger(body.revision)) return c.json({ error: 'Provide revision and allowed.' }, 400);
    const scope = c.get('scope'), owner = c.get('owner');
    const app = await find(c.env.DB, c.req.param('appID'), scope);
    if (!app) return c.json({ error: 'Mini app not found' }, 404);
    const connectors = await connectorsFor(c.env.DB, scope);
    if (body.allowed) {
      // Re-bind to the current catalog: approval covers exactly the definitions shown now.
      const stored = JSON.parse(app.toolsJSON) as GrantedTool[];
      const current = bindTools(stored, connectors);
      if (typeof current === 'string') return c.json({ error: `${current} Assign the connection and enable its tools in Connections, then review again.` }, 409);
      const updated = await c.env.DB.prepare('UPDATE mini_app SET approved_revision = revision, tools_json = ?, updated_at = ? WHERE id = ? AND revision = ? AND tools_json = ?')
        .bind(JSON.stringify(current), Date.now(), app.id, body.revision, app.toolsJSON).run();
      if (!updated.meta.changes) return c.json({ error: 'This mini app changed. Review it again.' }, 409);
    } else await c.env.DB.prepare('UPDATE mini_app SET approved_revision = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), app.id).run();
    const saved = await find(c.env.DB, app.id, scope);
    return saved ? c.json({ miniApp: summary(saved, connectors) }) : c.json({ error: 'Mini app not found' }, 404);
  });
  routes.post('/:appID/resolve', async c => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body) || Object.keys(body).some(key => !['inputs', 'timeZone'].includes(key))) return c.json({ error: 'Provide inputs and timeZone.' }, 400);
    const timeZone = zone(body.timeZone);
    if (!timeZone) return c.json({ error: 'Provide a valid time zone.' }, 400);
    const scope = c.get('scope'), owner = c.get('owner');
    const app = await find(c.env.DB, c.req.param('appID'), scope);
    if (!app) return c.json({ error: 'Mini app not found' }, 404);
    const connectors = app.toolsJSON === '[]' ? [] : await connectorsFor(c.env.DB, scope);
    if (!grantValid(app, connectors)) return c.json({ error: 'Review and enable this mini app first.', code: 'REVIEW_REQUIRED' }, 409);
    const inputs = validInputs(parseSpec(JSON.parse(app.specJSON)).spec, body.inputs);
    if (!inputs) return c.json({ error: 'Invalid inputs.' }, 400);
    // Each load runs remote reads; keep it well below the general management budget.
    if (!(await admitAuthRequest(c.env.DB, owner, 'mini-app-resolve', 20)).allowed) return c.json({ error: 'Too many refreshes. Please wait a minute.' }, 429);
    // Opens feed Home quick access; reloads within ten minutes count as the same visit.
    await c.env.DB.prepare(`INSERT INTO mini_app_usage (app_id, user_id, opens, last_opened_at) VALUES (?1, ?2, 1, ?3)
      ON CONFLICT(app_id, user_id) DO UPDATE SET opens = opens + 1, last_opened_at = excluded.last_opened_at
      WHERE mini_app_usage.last_opened_at < excluded.last_opened_at - 600000`).bind(app.id, owner, Date.now()).run();
    const result = await resolve(c.env, app, connectors, inputs, timeZone);
    return c.json({ revision: app.revision, inputs, resolvedAt: Date.now(), ...result });
  });
  routes.post('/:appID/actions/:actionID', async c => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body) || Object.keys(body).some(key => !['executionID', 'revision', 'inputs', 'fields', 'timeZone', 'row'].includes(key))
      || typeof body.executionID !== 'string' || !uuid.test(body.executionID) || !Number.isInteger(body.revision)) return c.json({ error: 'Provide executionID and revision.' }, 400);
    const timeZone = zone(body.timeZone);
    if (!timeZone) return c.json({ error: 'Provide a valid time zone.' }, 400);
    const scope = c.get('scope'), owner = c.get('owner');
    const app = await find(c.env.DB, c.req.param('appID'), scope);
    if (!app) return c.json({ error: 'Mini app not found' }, 404);
    // Apps without external tools have no connector grant to recheck.
    const connectors = app.toolsJSON === '[]' ? [] : await connectorsFor(c.env.DB, scope);
    if (app.revision !== body.revision || !grantValid(app, connectors)) return c.json({ error: 'This mini app changed. Review it again.', code: 'REVIEW_REQUIRED' }, 409);
    // Local state taps (a counter's +) stay within the general 120/minute budget; external writes add a strict one.
    const local = parseSpec(JSON.parse(app.specJSON)).spec.actions.find(a => a.id === c.req.param('actionID'))?.kind === 'state';
    if (!local && !(await admitAuthRequest(c.env.DB, owner, 'mini-app-action', 10)).allowed) return c.json({ error: 'Too many actions. Please wait a minute.' }, 429);
    const outcome = await runAction(c.env, app, connectors, c.req.param('actionID'), body.executionID.toLowerCase(), body.inputs, body.fields, timeZone, body.row);
    if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status as 400);
    // Apps without remote reads return the updated view directly, so a tap costs no extra load.
    const spec = parseSpec(JSON.parse(app.specJSON)).spec;
    if (local && outcome.status === 'completed' && !spec.data.some(step => step.type === 'mcp')) {
      const inputs = validInputs(spec, body.inputs) ?? validInputs(spec, undefined)!;
      const { state, ...result } = outcome;
      return c.json({ ...result, resolution: { revision: app.revision, inputs, resolvedAt: Date.now(), ...await resolve(c.env, app, connectors, inputs, timeZone, state) } });
    }
    return c.json(outcome);
  });
  routes.post('/:appID/state', async c => {
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body) || Object.keys(body).filter(key => key !== 'inputs').sort().join(',') !== 'executionID,revision,timeZone,update'
      || typeof body.executionID !== 'string' || !uuid.test(body.executionID) || !Number.isInteger(body.revision)) return c.json({ error: 'Provide executionID, revision, timeZone and update.' }, 400);
    const timeZone = zone(body.timeZone);
    if (!timeZone) return c.json({ error: 'Provide a valid time zone.' }, 400);
    const scope = c.get('scope'), owner = c.get('owner');
    const app = await find(c.env.DB, c.req.param('appID'), scope);
    if (!app) return c.json({ error: 'Mini app not found' }, 404);
    const connectors = app.toolsJSON === '[]' ? [] : await connectorsFor(c.env.DB, scope);
    if (app.revision !== body.revision || !grantValid(app, connectors)) return c.json({ error: 'This mini app changed. Review it again.', code: 'REVIEW_REQUIRED' }, 409);
    // The current inputs keep the returned view consistent with what the person sees.
    const outcome = await runStateEdit(c.env, app, body.executionID.toLowerCase(), body.update, body.inputs, timeZone);
    if ('error' in outcome) return c.json({ error: outcome.error }, outcome.status as 400);
    const spec = parseSpec(JSON.parse(app.specJSON)).spec;
    if (outcome.status !== 'completed' || spec.data.some(step => step.type === 'mcp')) return c.json({ status: outcome.status, replayed: outcome.replayed });
    const { state, ...result } = outcome, inputs = validInputs(spec, body.inputs) ?? validInputs(spec, undefined)!;
    return c.json({ ...result, resolution: { revision: app.revision, inputs, resolvedAt: Date.now(), ...await resolve(c.env, app, connectors, inputs, timeZone, state) } });
  });
  routes.delete('/:appID', async c => {
    const scope = c.get('scope');
    await c.env.DB.prepare(`DELETE FROM mini_app WHERE id = ? AND ${scope.sql}`).bind(c.req.param('appID'), ...scope.values).run();
    return c.body(null, 204);
  });
  return routes;
}
