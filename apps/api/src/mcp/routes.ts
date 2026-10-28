import { beginOAuth, finishOAuth, callbackURL } from './oauth';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { readBearerSession } from '../lib/session';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { isRecord } from '../chat/meta';
import { connectionColumns, credential, discover, endpoint, type Connection, type RemoteTool } from './client';
import { OAuthSetupFailure, safeFailureCode } from './errors';

const routes = new Hono<{ Bindings: Env; Variables: { owner: string; sessionID: string } }>();
routes.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  c.set('sessionID', session.session.id);
  const contact = await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?')
    .bind(c.req.param('contactID'), session.user.id).first();
  if (!contact) return c.json({ error: 'Contact not found' }, 404);
  if (!(await admitAuthRequest(c.env.DB, session.user.id, 'mcp-management', 30)).allowed) return c.json({ error: 'Too many attempts. Please wait a minute.' }, 429);
  await next();
});
routes.use('*', bodyLimit({ maxSize: 12000, onError: c => c.json({ error: 'Request body too large' }, 413) }));
routes.onError((failure, c) => {
  const code = failure instanceof OAuthSetupFailure ? failure.code : safeFailureCode(failure);
  const messages: Record<string, string> = {
    MCP_OAUTH_CLIENT: 'This provider requires a registered OAuth client. Open Advanced OAuth settings and enter its authorization server and Client ID.',
    MCP_OAUTH_STATIC_ISSUER: 'Enter the authorization server in Advanced OAuth settings when using your own client credentials.',
    MCP_OAUTH_ISSUER_REQUIRED: 'This server does not advertise an authorization server. Enter it in Advanced OAuth settings.',
    MCP_DNS_UNAVAILABLE: 'Wildcard could not complete its DNS safety check. Please try again shortly.',
    MCP_DNS: 'The server hostname must resolve to public internet addresses.',
    MCP_ENDPOINT: 'Enter a public HTTPS endpoint with no query, fragment, credentials, or custom port.',
  };
  const reference = crypto.randomUUID();
  const stage = failure instanceof OAuthSetupFailure ? failure.stage : 'connection';
  // Log only fixed codes/stages and a random reference, never remote errors or URLs.
  console.warn({ event: 'mcp_connection_failure', reference, stage, code });
  const message = messages[code] ?? (failure instanceof OAuthSetupFailure ? failure.message : 'Unable to connect. Check the HTTPS endpoint or authorize again from Connections.');
  return c.json({ error: `${message} Reference: ${reference}`, code, stage, reference }, 422);
});
routes.get('/', async c => {
  const { results } = await c.env.DB.prepare(`SELECT ${connectionColumns} FROM mcp_connection WHERE contact_id = ? AND user_id = ? ORDER BY created_at, id`)
    .bind(c.req.param('contactID'), c.get('owner')).all<Connection>();
  const connections = await Promise.all(results.map(async ({ id, name, url, credential: token, toolsJSON, authType, contactID, userID }) => {
    const oauth = authType === 'oauth' ? await c.env.DB.prepare('SELECT tokens_json IS NOT NULL AS connected, expires_at AS expiresAt, config_json AS config FROM mcp_oauth WHERE connection_id = ?').bind(id).first<{ connected: number; expiresAt: number | null; config: string }>() : null;
    let oauthIssuer: string | null = null, oauthScope: string | null = null;
    if (oauth) {
      try { const config = JSON.parse(await credential(c.env, { id, userID, contactID }, oauth.config, true)); oauthIssuer = config.issuer; oauthScope = config.scope; } catch { /* A rotated encryption key requires reconfiguration. Keep disconnect available. */ }
    }
    return { id, name, url, authType, oauthIssuer, oauthScope, oauthConfigured: !!oauthIssuer, authenticated: authType === 'oauth' ? !!oauth?.connected && !!oauthIssuer : !!token, oauthStatus: authType === 'oauth' ? (oauth?.connected && oauthIssuer ? 'connected' : 'authorization_required') : null, tools: JSON.parse(toolsJSON) as RemoteTool[] };
  }));
  let redirect: string | null = null;
  try { redirect = callbackURL(c.env); } catch { /* Public/Bearer connections still work in local HTTP development. */ }
  return c.json({ connections, callbackURL: redirect });
});
routes.post('/', async c => {
  const data: unknown = await c.req.json();
  if (!isRecord(data) || Object.keys(data).some(k => !['name', 'url', 'token', 'consent', 'authType'].includes(k)) || data.consent !== true ||
    typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80 || /[\u0000-\u001f\u007f]/.test(data.name) || typeof data.url !== 'string' || (data.authType !== undefined && !['none', 'bearer', 'oauth'].includes(String(data.authType))) || (data.authType === 'oauth' && !!data.token) ||
    (data.token !== undefined && (typeof data.token !== 'string' || data.token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(data.token)))) {
    return c.json({ error: 'Provide a name, HTTPS endpoint, optional Bearer token, and consent.' }, 400);
  }
  const contactID = c.req.param('contactID')!;
  const userID = c.get('owner');
  const connection: Connection = { id: crypto.randomUUID(), contactID, userID, name: data.name.trim(), url: endpoint(data.url.trim()).href, credential: null, toolsJSON: '[]', authType: data.authType === 'oauth' ? 'oauth' : data.token ? 'bearer' : 'none' };
  if (data.token) connection.credential = await credential(c.env, connection, data.token as string);
  const tools = connection.authType === 'oauth' ? [] : await discover(c.env, connection);
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO mcp_connection (id, contact_id, user_id, name, url, credential, tools_json, created_at, auth_type)
      SELECT ?1, c.id, c.user_id, ?4, ?5, ?6, ?7, ?8, ?9 FROM contact c WHERE c.id = ?2 AND c.user_id = ?3
      AND (SELECT COUNT(*) FROM mcp_connection WHERE contact_id = ?2) < 4
      AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = ?2 AND status IN ('queued', 'running'))`)
      .bind(connection.id, contactID, userID, connection.name, connection.url, connection.credential, JSON.stringify(tools), Date.now(), connection.authType),
    c.env.DB.prepare(`INSERT OR IGNORE INTO mcp_private_contact (contact_id) SELECT contact_id FROM mcp_connection WHERE id = ?`).bind(connection.id),
  ]);
  if (!result[0].meta.changes) return c.json({ error: 'Wait for the current reply to finish. Each contact supports up to four connections.' }, 409);
  return c.json({ id: connection.id }, 201);
});
async function owned(db: D1Database, contactID: string, userID: string, id: string) {
  return db.prepare(`SELECT ${connectionColumns} FROM mcp_connection WHERE id = ? AND contact_id = ? AND user_id = ?`)
    .bind(id, contactID, userID).first<Connection>();
}
routes.post('/:connectionID/oauth/start', async c => {
  const connection = await owned(c.env.DB, c.req.param('contactID')!, c.get('owner'), c.req.param('connectionID'));
  if (!connection) return c.json({ error: 'Connection not found' }, 404);
  const body: unknown = await c.req.json();
  if (!isRecord(body) || Object.keys(body).some(k => !['platform', 'issuer', 'scope', 'clientID', 'clientSecret', 'rediscover'].includes(k))) return c.json({ error: 'Invalid OAuth configuration.' }, 400);
  return c.json(await beginOAuth(c.env, connection, c.get('sessionID'), body));
});
routes.post('/:connectionID/oauth/finish', async c => {
  const connection = await owned(c.env.DB, c.req.param('contactID')!, c.get('owner'), c.req.param('connectionID'));
  if (!connection || connection.authType !== 'oauth') return c.json({ error: 'Connection not found' }, 404);
  const body: unknown = await c.req.json();
  if (!isRecord(body) || Object.keys(body).sort().join(',') !== 'flowID,proof' || typeof body.flowID !== 'string' || typeof body.proof !== 'string') return c.json({ error: 'Invalid OAuth completion.' }, 400);
  if (!await finishOAuth(c.env, connection, c.get('sessionID'), body.flowID, body.proof)) return c.json({ error: 'Authorization was canceled or denied. Return to Connections to try again.' }, 400);
  // Authorization and tool permissions remain separate. Discovery never enables tools.
  return c.json({ authorized: true });
});
routes.post('/:connectionID/refresh', async c => {
  const connection = await owned(c.env.DB, c.req.param('contactID')!, c.get('owner'), c.req.param('connectionID'));
  if (!connection) return c.json({ error: 'Connection not found' }, 404);
  const tools = await discover(c.env, connection);
  const old = JSON.parse(connection.toolsJSON) as RemoteTool[];
  for (const tool of tools) tool.allowed = old.some(t => t.fingerprint === tool.fingerprint && t.allowed);
  const result = await c.env.DB.prepare('UPDATE mcp_connection SET tools_json = ? WHERE id = ? AND tools_json = ?')
    .bind(JSON.stringify(tools), connection.id, connection.toolsJSON).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'Permissions changed. Refresh and try again.' }, 409);
});
routes.patch('/:connectionID', async c => {
  const connection = await owned(c.env.DB, c.req.param('contactID')!, c.get('owner'), c.req.param('connectionID'));
  if (!connection) return c.json({ error: 'Connection not found' }, 404);
  const body: unknown = await c.req.json();
  if (!isRecord(body) || Object.keys(body).sort().join(',') !== 'allowed,fingerprint' || typeof body.fingerprint !== 'string' || typeof body.allowed !== 'boolean') return c.json({ error: 'Provide a tool fingerprint and permission.' }, 400);
  const tools = JSON.parse(connection.toolsJSON) as RemoteTool[];
  const tool = tools.find(t => t.fingerprint === body.fingerprint);
  if (!tool) return c.json({ error: 'Tool changed. Refresh tools and review permissions.' }, 409);
  if (body.allowed && connection.authType === 'oauth' && !await c.env.DB.prepare('SELECT connection_id FROM mcp_oauth WHERE connection_id = ? AND tokens_json IS NOT NULL').bind(connection.id).first()) return c.json({ error: 'Authorize this connection before enabling tools.' }, 409);
  tool.allowed = body.allowed;
  const result = await c.env.DB.prepare('UPDATE mcp_connection SET tools_json = ? WHERE id = ? AND tools_json = ?')
    .bind(JSON.stringify(tools), connection.id, connection.toolsJSON).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: 'Permissions changed. Refresh and try again.' }, 409);
});
routes.delete('/:connectionID', async c => {
  await c.env.DB.prepare('DELETE FROM mcp_connection WHERE id = ? AND contact_id = ? AND user_id = ?')
    .bind(c.req.param('connectionID'), c.req.param('contactID'), c.get('owner')).run();
  return c.body(null, 204);
});
export default routes;
