import { Hono } from 'hono';
import { html } from 'hono/html';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { discoverAuthorizationServerMetadata, discoverOAuthProtectedResourceMetadata, exchangeAuthorization,
  extractWWWAuthenticateParams, buildDiscoveryUrls, refreshAuthorization, registerClient, startAuthorization } from '@modelcontextprotocol/sdk/client/auth.js';
import type { AuthorizationServerMetadata, OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { isRecord } from '../chat/meta';
import type { Connection } from './client';
import { credential, digest, endpoint, checkPublicDNS, size, rejectRedirect } from './security';
import { oauthStage } from './errors';

export type OAuthConfig = { issuer: string; metadata: AuthorizationServerMetadata; client: OAuthClientInformationMixed; resource: string; scope: string };
type OAuthRow = { config: string; tokens: string | null; expiresAt: number | null; generation: string; lock: string | null; lockedUntil: number | null };
type Flow = { id: string; connectionID: string; generation: string; payload: string; sessionID: string; expiresAt: number };
type FlowPayload = { config: OAuthConfig; verifier: string; authorizationURL: string; platform: 'ios' | 'web'; code?: string; denied?: boolean };
const oauthColumns = 'config_json AS config, tokens_json AS tokens, expires_at AS expiresAt, generation, refresh_lock AS lock, locked_until AS lockedUntil';
const flowColumns = 'id, connection_id AS connectionID, generation, payload_json AS payload, session_id AS sessionID, expires_at AS expiresAt';
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export const callbackURL = (env: Env) => new URL('/api/v1/mcp/oauth/callback', secureURL(env.BETTER_AUTH_URL)).href;
export const launchURL = (env: Env, ticket: string) => new URL(`/api/v1/mcp/oauth/launch?ticket=${ticket}`, secureURL(env.BETTER_AUTH_URL)).href;
const cookieName = (id: string) => `__Host-wildcard_mcp_${id}`;

function secureURL(value: string) { return endpoint(value); }
function sameURL(a: string, b: string) { return new URL(a).href === new URL(b).href; }
// Only explicitly approved destinations can receive a request. Discovery never carries credentials.
export function oauthFetch(allowed: string[], method: 'GET' | 'POST', headersOnly = false): typeof fetch {
  const destinations = new Set(allowed.map(v => secureURL(v).href));
  return async (input, init) => {
    const url = secureURL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!destinations.has(url.href) || (init?.method ?? 'GET').toUpperCase() !== method) throw new Error('MCP_OAUTH_DESTINATION');
    const signal = AbortSignal.timeout(10_000);
    await checkPublicDNS(url.hostname, signal);
    let response: Response;
    try { response = await fetch(url, { ...init, redirect: 'manual', signal }); }
    catch { throw new Error('MCP_OAUTH_NETWORK'); }
    await rejectRedirect(response);
    if (headersOnly) { await response.body?.cancel(); return new Response(null, { status: response.status, headers: response.headers }); }
    if (!response.body) return response;
    const reader = response.body.getReader(); let text = ''; let bytes = 0; const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 64 * 1024) throw new Error('MCP_OAUTH_SIZE');
        text += decoder.decode(part.value, { stream: true });
      }
      return new Response(text + decoder.decode(), { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally { await reader.cancel().catch(() => undefined); }
  };
}
function issuerURL(value: string) { const url = secureURL(value); return url.pathname === '/' ? url.origin : url.href; }
export const clientMetadataURL = (env: Env) => new URL('/api/v1/mcp/oauth/client-metadata', secureURL(env.BETTER_AUTH_URL)).href;
export function clientMetadata(env: Env) {
  return { client_id: clientMetadataURL(env), client_name: 'Wildcard', redirect_uris: [callbackURL(env)],
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
}
export async function prepareConfig(connection: Connection, env: Env, body: Record<string, unknown>): Promise<OAuthConfig> {
  if ((body.issuer !== undefined && (typeof body.issuer !== 'string' || body.issuer.length > 2048)) ||
    (body.scope !== undefined && (typeof body.scope !== 'string' || body.scope.length > 2000 || /[\u0000-\u001f\u007f]/.test(body.scope))) ||
    (body.clientID !== undefined && (typeof body.clientID !== 'string' || body.clientID.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(body.clientID))) ||
    (body.clientSecret !== undefined && (typeof body.clientSecret !== 'string' || body.clientSecret.length > 4096 || /[\u0000-\u001f\u007f]/.test(body.clientSecret)))) throw new Error('MCP_OAUTH_CONFIG');
  const explicitIssuer = typeof body.issuer === 'string' && body.issuer.trim() ? issuerURL(body.issuer.trim()) : null;
  // Never attach pre-registered credentials to an automatically selected issuer.
  if ((body.clientID || body.clientSecret) && !explicitIssuer) throw new Error('MCP_OAUTH_STATIC_ISSUER');
  let issuer = explicitIssuer;
  const server = endpoint(connection.url);
  const probe = await oauthStage('endpoint_probe', () => oauthFetch([server.href], 'GET', true)(server, { method: 'GET', headers: { Accept: 'application/json, text/event-stream' } }));
  const challenge = extractWWWAuthenticateParams(probe);
  const hint = challenge.resourceMetadataUrl;
  const paths = [new URL(`/.well-known/oauth-protected-resource${server.pathname === '/' ? '' : server.pathname}`, server.origin).href,
    new URL('/.well-known/oauth-protected-resource', server.origin).href];
  if (hint) {
    // Resource metadata is public and credential-free; RFC 9728 permits another host.
    // Its declared resource must still match this MCP server before trusting any issuer.
    secureURL(hint.href); paths.push(hint.href);
  }
  let resource = server.href;
  let resourceScopes: string[] | undefined;
  await oauthStage('resource_metadata', async () => {
    try {
      const resourceMetadata = await discoverOAuthProtectedResourceMetadata(server, { resourceMetadataUrl: hint }, oauthFetch(paths, 'GET'));
      const declared = secureURL(resourceMetadata.resource);
      if (declared.origin !== server.origin || !(server.pathname === declared.pathname || server.pathname.startsWith(declared.pathname.replace(/\/$/, '') + '/'))) throw new Error('MCP_OAUTH_RESOURCE');
      if (explicitIssuer && resourceMetadata.authorization_servers?.length && !resourceMetadata.authorization_servers.some(value => sameURL(value, explicitIssuer))) throw new Error('MCP_OAUTH_ISSUER');
      // Select the first advertised server deterministically, never try a grid of issuers.
      if (!issuer && resourceMetadata.authorization_servers?.length) issuer = issuerURL(resourceMetadata.authorization_servers[0]);
      resource = declared.href;
      resourceScopes = resourceMetadata.scopes_supported;
    } catch (error) {
      if (error instanceof Error && /^MCP_/.test(error.message)) throw error;
      if (!(error instanceof Error) || !/404|not found|does not implement OAuth 2.0 Protected Resource Metadata/i.test(error.message)) throw new Error('MCP_OAUTH_RESOURCE');
    }
  });
  if (!issuer) throw new Error('MCP_OAUTH_ISSUER_REQUIRED');
  const selectedIssuer = issuer;
  const metadata = await oauthStage('authorization_metadata', async () => {
    const discovery = buildDiscoveryUrls(selectedIssuer).map(v => v.url.href);
    const metadata = await discoverAuthorizationServerMetadata(selectedIssuer, { fetchFn: oauthFetch(discovery, 'GET') });
    if (!metadata || !sameURL(metadata.issuer, selectedIssuer) || !metadata.authorization_endpoint || !metadata.token_endpoint) throw new Error('MCP_OAUTH_METADATA');
    secureURL(metadata.authorization_endpoint); secureURL(metadata.token_endpoint);
    if (metadata.code_challenge_methods_supported && !metadata.code_challenge_methods_supported.includes('S256')) throw new Error('MCP_OAUTH_PKCE');
    return metadata;
  });
  // Challenge scopes take precedence over resource scopes. AS-wide scopes can be
  // unrelated to this MCP resource and must never be requested wholesale.
  const scope = typeof body.scope === 'string' && body.scope.trim() ? body.scope.trim() : challenge.scope ?? resourceScopes?.join(' ') ?? '';
  if (scope.length > 2000 || /[\u0000-\u001f\u007f]/.test(scope)) throw new Error('MCP_OAUTH_SCOPE');
  let client: OAuthClientInformationMixed;
  if (body.clientID) client = { client_id: body.clientID as string, ...(body.clientSecret ? { client_secret: body.clientSecret as string } : {}), issuer };
  else if (body.clientSecret) throw new Error('MCP_OAUTH_CLIENT');
  else if (metadata.client_id_metadata_document_supported === true) client = { client_id: clientMetadataURL(env), issuer };
  else if (metadata.registration_endpoint) {
    const registrationEndpoint = metadata.registration_endpoint;
    client = await oauthStage('client_registration', async () => {
      secureURL(registrationEndpoint);
      const { client_id: _documentID, ...registrationMetadata } = clientMetadata(env);
      return { ...await registerClient(selectedIssuer, { metadata, scope, clientMetadata: registrationMetadata,
        fetchFn: oauthFetch([registrationEndpoint], 'POST') }), issuer: selectedIssuer };
    });
  } else throw new Error('MCP_OAUTH_CLIENT');
  if (size(client) > 16000) throw new Error('MCP_OAUTH_SIZE');
  const config = { issuer, metadata, client, resource, scope };
  if (size(config) > 32000) throw new Error('MCP_OAUTH_SIZE');
  return config;
}

async function readOAuth(env: Env, connection: Connection) {
  return env.DB.prepare(`SELECT ${oauthColumns} FROM mcp_oauth WHERE connection_id = ?`).bind(connection.id).first<OAuthRow>();
}
export async function beginOAuth(env: Env, connection: Connection, sessionID: string, body: Record<string, unknown>) {
  if (connection.authType !== 'oauth' || !['web', 'ios'].includes(String(body.platform))) throw new Error('MCP_OAUTH_PLATFORM');
  if (body.platform === 'web' && secureURL(env.MCP_WEB_ORIGIN).pathname !== '/') throw new Error('MCP_OAUTH_ORIGIN');
  const old = await oauthStage('flow_storage', () => readOAuth(env, connection));
  if (body.rediscover !== undefined && typeof body.rediscover !== 'boolean') throw new Error('MCP_OAUTH_CONFIG');
  const customized = ['issuer', 'scope', 'clientID', 'clientSecret'].some(k => typeof body[k] === 'string' && body[k].trim());
  const config = !old || body.rediscover === true || customized ? await prepareConfig(connection, env, body)
    : await oauthStage('saved_configuration', async () => JSON.parse(await credential(env, connection, old.config, true)) as OAuthConfig);
  if (!config) throw new Error('MCP_OAUTH_CONFIG');
  const state = secret(), ticket = secret(), generation = secret(), id = crypto.randomUUID();
  const { authorizationUrl, codeVerifier } = await oauthStage('authorization_start', () => startAuthorization(config.issuer, { metadata: config.metadata,
    clientInformation: config.client, redirectUrl: callbackURL(env), scope: config.scope, state, resource: config.resource }));
  if (config.issuer === 'https://accounts.google.com') { authorizationUrl.searchParams.set('access_type', 'offline'); authorizationUrl.searchParams.set('prompt', 'consent'); }
  if (authorizationUrl.origin !== secureURL(config.metadata.authorization_endpoint!).origin) throw new Error('MCP_OAUTH_DESTINATION');
  const payload: FlowPayload = { config, verifier: codeVerifier, authorizationURL: authorizationUrl.href, platform: body.platform as 'web' | 'ios' };
  await oauthStage('flow_storage', async () => env.DB.batch([
    env.DB.prepare('DELETE FROM mcp_oauth_flow WHERE expires_at <= ?').bind(Date.now()),
    env.DB.prepare('DELETE FROM mcp_oauth_flow WHERE connection_id = ?').bind(connection.id),
    env.DB.prepare(`INSERT INTO mcp_oauth (connection_id, config_json, generation) SELECT id, ?2, ?3 FROM mcp_connector WHERE id = ?1
      ON CONFLICT(connection_id) DO UPDATE SET config_json = excluded.config_json, generation = excluded.generation, tokens_json = NULL, expires_at = NULL, refresh_lock = NULL, locked_until = NULL`)
      .bind(connection.id, await credential(env, connection, JSON.stringify(config)), generation),
    env.DB.prepare('UPDATE mcp_connector SET tools_json = ? WHERE id = ?').bind('[]', connection.id),
    env.DB.prepare(`INSERT INTO mcp_oauth_flow (id, connection_id, session_id, generation, launch_hash, state_hash, payload_json, expires_at)
      SELECT ?1, id, ?3, ?4, ?5, ?6, ?7, ?8 FROM mcp_connector WHERE id = ?2`)
      .bind(id, connection.id, sessionID, generation, await digest(ticket), await digest(state), await credential(env, connection, JSON.stringify(payload)), Date.now() + 10 * 60_000),
  ]));
  return { flowID: id, launchURL: launchURL(env, ticket), callbackURL: callbackURL(env) };
}
async function flowConnection(env: Env, id: string) {
  return env.DB.prepare(`SELECT id, credential_scope AS credentialScope, user_id AS userID, name, url, credential, tools_json AS toolsJSON, auth_type AS authType
    FROM mcp_connector WHERE id = ? AND auth_type = 'oauth'`).bind(id).first<Connection>();
}
export const oauthPublic = new Hono<{ Bindings: Env }>();
oauthPublic.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store'); c.header('Referrer-Policy', 'no-referrer');
  if (!(await admitAuthRequest(c.env.DB, c.req.header('CF-Connecting-IP') ?? 'local', 'mcp-oauth-public', 60)).allowed) return c.text('Too many attempts. Please wait a minute.', 429);
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  await next();
});
oauthPublic.onError((_error, c) => c.text('Authorization could not be completed. Return to Wildcard and try again.', 400));
oauthPublic.get('/client-metadata', c => c.json(clientMetadata(c.env)));
oauthPublic.get('/launch', async c => {
  if (new URL(c.req.url).searchParams.getAll('ticket').length !== 1) return c.text('Invalid authorization request.', 400);
  const ticket = c.req.query('ticket');
  if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) return c.text('Invalid authorization request.', 400);
  const browser = secret();
  const flow = await c.env.DB.prepare(`UPDATE mcp_oauth_flow SET launch_hash = NULL, browser_hash = ?1
    WHERE launch_hash = ?2 AND expires_at > ?3 AND browser_hash IS NULL AND EXISTS (SELECT 1 FROM session s WHERE s.id = mcp_oauth_flow.session_id AND s.expires_at > ?3) RETURNING ${flowColumns}`)
    .bind(await digest(browser), await digest(ticket), Date.now()).first<Flow>();
  if (!flow) return c.text('Authorization expired. Return to Wildcard and try again.', 400);
  const connection = await flowConnection(c.env, flow.connectionID); if (!connection) return c.text('Connection unavailable.', 400);
  const payload = JSON.parse(await credential(c.env, connection, flow.payload, true)) as FlowPayload;
  setCookie(c, cookieName(flow.id), browser, { secure: true, httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 600 });
  return c.redirect(payload.authorizationURL, 302);
});
oauthPublic.get('/callback', async c => {
  const query = new URL(c.req.url).searchParams;
  if (query.getAll('state').length !== 1 || ['code', 'error', 'iss'].some(k => query.getAll(k).length > 1) || (query.has('code') && query.has('error'))) return c.text('Invalid authorization response.', 400);
  const state = c.req.query('state');
  if (!state || !/^[a-f0-9]{64}$/.test(state)) return c.text('Invalid authorization response.', 400);
  const flow = await c.env.DB.prepare(`SELECT ${flowColumns} FROM mcp_oauth_flow WHERE state_hash = ? AND expires_at > ? AND proof_hash IS NULL`)
    .bind(await digest(state), Date.now()).first<Flow>();
  if (!flow) return c.text('Authorization expired or already used.', 400);
  const browser = getCookie(c, cookieName(flow.id));
  if (!browser || !/^[a-f0-9]{64}$/.test(browser)) return c.text('Open authorization from Wildcard on this device.', 400);
  const connection = await flowConnection(c.env, flow.connectionID); if (!connection) return c.text('Connection unavailable.', 400);
  const payload = JSON.parse(await credential(c.env, connection, flow.payload, true)) as FlowPayload;
  const code = c.req.query('code'); const issuer = c.req.query('iss');
  const denied = !!c.req.query('error');
  if ((!denied && !code) || (code?.length ?? 0) > 4096 || (issuer && !sameURL(issuer, payload.config.issuer))) {
    await c.env.DB.prepare('DELETE FROM mcp_oauth_flow WHERE id = ? AND browser_hash = ?').bind(flow.id, await digest(browser)).run();
    deleteCookie(c, cookieName(flow.id), { path: '/', secure: true });
    return c.text('Authorization denied or invalid. Return to Wildcard to reconnect.', 400);
  }
  const proof = secret(); payload.code = denied ? undefined : code; payload.denied = denied;
  const result = await c.env.DB.prepare(`UPDATE mcp_oauth_flow SET proof_hash = ?1, browser_hash = NULL, payload_json = ?2
    WHERE id = ?3 AND browser_hash = ?4 AND proof_hash IS NULL AND expires_at > ?5`)
    .bind(await digest(proof), await credential(c.env, connection, JSON.stringify(payload)), flow.id, await digest(browser), Date.now()).run();
  deleteCookie(c, cookieName(flow.id), { path: '/', secure: true });
  if (!result.meta.changes) return c.text('Authorization expired or already used.', 400);
  const target = payload.platform === 'ios' ? new URL('wildcard://mcp/oauth-complete') : new URL('/mcp/oauth-complete', secureURL(c.env.MCP_WEB_ORIGIN));
  // A short-lived completion proof, never a provider token or authorization code.
  if (payload.platform === 'ios') { target.searchParams.set('flow', flow.id); target.searchParams.set('proof', proof); }
  else target.hash = new URLSearchParams({ flow: flow.id, proof }).toString();
  // End the provider form navigation here. A 302 to the web/app destination can
  // be blocked by the provider's form-action policy across the redirect chain.
  const nonce = secret();
  c.header('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`);
  c.header('X-Content-Type-Options', 'nosniff');
  return c.html(html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Return to Wildcard</title>
    <style nonce="${nonce}">body{font:16px system-ui;max-width:28rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5}a{display:inline-block;padding:.75rem 1rem;border-radius:.75rem;background:#20212a;color:white;text-decoration:none}a:focus-visible{outline:3px solid #647cff;outline-offset:4px}</style></head>
    <body><h1>Return to Wildcard</h1><p>Continue in Wildcard to finish this authorization request.</p>
    <a id="mcp-return" href="${target.href}" rel="noreferrer">Continue to Wildcard</a>
    <script nonce="${nonce}">history.replaceState(null,'',location.pathname);location.replace(document.getElementById('mcp-return').href);</script>
    </body></html>`);
});
function expires(tokens: OAuthTokens) {
  if (size(tokens) > 40000 || !tokens.access_token || tokens.access_token.length > 16000 || tokens.token_type.toLowerCase() !== 'bearer' || (tokens.refresh_token?.length ?? 0) > 16000) throw new Error('MCP_OAUTH_TOKENS');
  if (/[\s\u0000-\u001f\u007f]/.test(tokens.access_token)) throw new Error('MCP_OAUTH_TOKENS');
  const ttl = tokens.expires_in ?? 300;
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 366 * 24 * 3600) throw new Error('MCP_OAUTH_TOKENS');
  return Date.now() + ttl * 1000;
}
export async function finishOAuth(env: Env, connection: Connection, sessionID: string, flowID: string, proof: string) {
  if (!/^[a-f0-9]{64}$/.test(proof) || !/^[a-f0-9-]{36}$/.test(flowID)) throw new Error('MCP_OAUTH_PROOF');
  const flow = await env.DB.prepare(`DELETE FROM mcp_oauth_flow WHERE id = ?1 AND connection_id = ?2 AND session_id = ?3 AND proof_hash = ?4 AND expires_at > ?5
    AND generation = (SELECT generation FROM mcp_oauth WHERE connection_id = ?2) RETURNING ${flowColumns}`)
    .bind(flowID, connection.id, sessionID, await digest(proof), Date.now()).first<Flow>();
  if (!flow) throw new Error('MCP_OAUTH_PROOF');
  const payload = JSON.parse(await credential(env, connection, flow.payload, true)) as FlowPayload;
  if (payload.denied) return false;
  if (!payload.code) throw new Error('MCP_OAUTH_CODE');
  const config = payload.config;
  const code = payload.code;
  const tokens = await oauthStage('token_exchange', () => exchangeAuthorization(config.issuer, { metadata: config.metadata, clientInformation: config.client, authorizationCode: code,
    codeVerifier: payload.verifier, redirectUri: callbackURL(env), resource: config.resource, fetchFn: oauthFetch([config.metadata.token_endpoint!], 'POST') }));
  const expiresAt = expires(tokens);
  const result = await env.DB.prepare('UPDATE mcp_oauth SET tokens_json = ?, expires_at = ? WHERE connection_id = ? AND generation = ?')
    .bind(await credential(env, connection, JSON.stringify(tokens)), expiresAt, connection.id, flow.generation).run();
  if (!result.meta.changes) throw new Error('MCP_OAUTH_CANCELLED');
  return true;
}
export async function accessToken(env: Env, connection: Connection): Promise<string> {
  const row = await readOAuth(env, connection);
  if (!row?.tokens || (connection.oauthGeneration && connection.oauthGeneration !== row.generation)) throw new Error('MCP_OAUTH_REQUIRED');
  const tokens = JSON.parse(await credential(env, connection, row.tokens, true)) as OAuthTokens;
  if (row.expiresAt && row.expiresAt > Date.now() + 30_000) return tokens.access_token;
  if (!tokens.refresh_token) {
    if (row.expiresAt && row.expiresAt > Date.now()) return tokens.access_token;
    await env.DB.prepare('UPDATE mcp_oauth SET tokens_json = NULL, expires_at = NULL WHERE connection_id = ? AND tokens_json = ?').bind(connection.id, row.tokens).run();
    throw new Error('MCP_OAUTH_REQUIRED');
  }
  if (row.lock) {
    if (row.lockedUntil && row.lockedUntil > Date.now()) throw new Error('MCP_OAUTH_REFRESH_BUSY');
    await env.DB.prepare('UPDATE mcp_oauth SET tokens_json = NULL, expires_at = NULL, refresh_lock = NULL, locked_until = NULL WHERE connection_id = ? AND refresh_lock = ?').bind(connection.id, row.lock).run();
    throw new Error('MCP_OAUTH_REQUIRED');
  }
  const lock = secret();
  const leased = await env.DB.prepare(`UPDATE mcp_oauth SET refresh_lock = ?1, locked_until = ?2 WHERE connection_id = ?3
    AND tokens_json = ?4 AND generation = ?5 AND refresh_lock IS NULL`)
    .bind(lock, Date.now() + 30_000, connection.id, row.tokens, row.generation).run();
  if (!leased.meta.changes) throw new Error('MCP_OAUTH_REFRESH_BUSY');
  try {
    const config = JSON.parse(await credential(env, connection, row.config, true)) as OAuthConfig;
    const refreshed = await refreshAuthorization(config.issuer, { metadata: config.metadata, clientInformation: config.client,
      refreshToken: tokens.refresh_token, resource: config.resource, fetchFn: oauthFetch([config.metadata.token_endpoint!], 'POST') });
    const expiresAt = expires(refreshed);
    const result = await env.DB.prepare(`UPDATE mcp_oauth SET tokens_json = ?, expires_at = ?, refresh_lock = NULL, locked_until = NULL
      WHERE connection_id = ? AND generation = ? AND refresh_lock = ?`)
      .bind(await credential(env, connection, JSON.stringify(refreshed)), expiresAt, connection.id, row.generation, lock).run();
    if (!result.meta.changes) throw new Error('MCP_OAUTH_CANCELLED');
    return refreshed.access_token;
  } catch {
    // Rotation may have happened before a network failure. Never replay that refresh grant.
    await env.DB.prepare('UPDATE mcp_oauth SET tokens_json = NULL, expires_at = NULL, refresh_lock = NULL, locked_until = NULL WHERE connection_id = ? AND refresh_lock = ?')
      .bind(connection.id, lock).run();
    throw new Error('MCP_OAUTH_REQUIRED');
  }
}
export async function authenticationFailed(env: Env, connection: Connection, token: string | null) {
  const row = await readOAuth(env, connection); if (!row?.tokens) return;
  const tokens = JSON.parse(await credential(env, connection, row.tokens, true)) as OAuthTokens;
  if (tokens.access_token !== token) return;
  await env.DB.prepare('UPDATE mcp_oauth SET tokens_json = NULL, expires_at = NULL WHERE connection_id = ? AND tokens_json = ?')
    .bind(connection.id, row.tokens).run();
}

export async function cleanOAuthFlows(env: Env) {
  await env.DB.prepare('DELETE FROM mcp_oauth_flow WHERE id IN (SELECT id FROM mcp_oauth_flow WHERE expires_at <= ? LIMIT 100)').bind(Date.now()).run();
}
