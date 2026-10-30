import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';
import { credential, endpoint, checkPublicDNS, digest, size, rejectRedirect } from './security';
import { accessToken, authenticationFailed } from './oauth';
export { credential, endpoint, digest, size, encoder } from './security';
import { validator } from './schema';
export { validator } from './schema';

// readOnly records the server's own read-only annotation (never trusted as proof
// of safety); Home only uses it to narrow which approved tools it may read.
export type RemoteTool = { name: string; description: string; inputSchema: Record<string, unknown>; fingerprint: string; allowed: boolean; readOnly?: boolean };
export type Connection = { id: string; credentialScope: string; userID: string; name: string; url: string; credential: string | null; toolsJSON: string; authType: 'none' | 'bearer' | 'oauth'; oauthGeneration?: string };
export const connectionColumns = 'id, credential_scope AS credentialScope, user_id AS userID, name, url, credential, tools_json AS toolsJSON, auth_type AS authType';

export async function remote<T>(env: Env, connection: Connection, action: (client: Client, signal: AbortSignal) => Promise<T>): Promise<T> {
  const url = endpoint(connection.url);
  const token = connection.authType === 'oauth' ? await accessToken(env, connection) : connection.credential ? await credential(env, connection, connection.credential, true) : null;
  const signal = AbortSignal.timeout(20_000);
  await checkPublicDNS(url.hostname, signal);
  let consumed = 0;
  const guardedFetch: typeof fetch = async (input, init) => {
    const target = endpoint(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (target.origin !== url.origin || target.pathname !== url.pathname) throw new Error('MCP_DESTINATION');
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const inherited = init?.signal ?? (typeof input === 'object' && !(input instanceof URL) ? input.signal : null);
    const requestSignal = inherited ? AbortSignal.any([signal, inherited]) : signal;
    const response = await fetch(target, { ...init, headers, redirect: 'manual', signal: requestSignal });
    await rejectRedirect(response);
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); if (connection.authType === 'oauth' && response.status === 401) await authenticationFailed(env, connection, token); throw new Error('MCP_AUTH'); }
    if (!response.body) return response;
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          consumed += value.byteLength;
          if (consumed > 1024 * 1024) { await reader.cancel(); controller.error(new Error('MCP_SIZE')); return; }
          controller.enqueue(value);
        } catch { controller.error(new Error('MCP_NETWORK')); }
      },
      cancel: () => reader.cancel(),
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  const transport = new StreamableHTTPClientTransport(url, { fetch: guardedFetch, reconnectionOptions: { maxRetries: 0, maxReconnectionDelay: 1000, initialReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } });
  const schemaProvider: jsonSchemaValidator = { getValidator<T>(schema: Record<string, unknown>) {
    const validate = validator(schema);
    return (value: unknown) => validate(value)
      ? { valid: true as const, data: value as T, errorMessage: undefined }
      : { valid: false as const, data: undefined, errorMessage: 'External schema validation failed.' };
  } };
  const client = new Client({ name: 'wildcard', version: '1.0.0' }, { capabilities: {}, jsonSchemaValidator: schemaProvider });
  try { await client.connect(transport, { signal, timeout: 20_000 }); return await action(client, signal); }
  finally {
    await client.close().catch(() => undefined);
  }
}

export async function discover(env: Env, connection: Connection): Promise<RemoteTool[]> {
  return remote(env, connection, catalog);
}
// Lists and fingerprints the complete catalog on an open session.
export async function catalog(client: Client, signal: AbortSignal): Promise<RemoteTool[]> {
  const catalog: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let index = 0; index < 8; index++) {
    const page = await client.listTools(cursor === undefined ? {} : { cursor }, { signal, timeout: 20_000 });
    catalog.push(...page.tools);
    if (catalog.length > 256) throw new Error('MCP_TOO_MANY_TOOLS');
    if (page.nextCursor === undefined) break;
    if (index === 7 || page.nextCursor.length > 2048 || cursors.has(page.nextCursor)) throw new Error('MCP_TOO_MANY_TOOLS');
    cursors.add(page.nextCursor); cursor = page.nextCursor;
  }
  const names = new Set<string>();
  const tools = await Promise.all(catalog.map(async tool => {
    if (!tool.name || tool.name.length > 128 || names.has(tool.name)) throw new Error('MCP_TOOL');
    names.add(tool.name);
    validator(tool.inputSchema);
    if (tool.outputSchema) validator(tool.outputSchema);
    const description = (tool.description ?? '').slice(0, 2000);
    const fingerprint = await digest(JSON.stringify([tool.name, tool.description ?? '', tool.inputSchema, tool.outputSchema ?? null, tool.annotations ?? null]));
    const readOnly = tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true;
    return { name: tool.name, description, inputSchema: tool.inputSchema, fingerprint, allowed: false, ...(readOnly ? { readOnly } : {}) };
  }));
  if (size(tools) > 256000) throw new Error('MCP_CATALOG_SIZE');
  return tools;
}
export async function privateContact(db: D1Database, contactID: string) {
  return !!await db.prepare('SELECT contact_id FROM mcp_private_contact WHERE contact_id = ?').bind(contactID).first();
}
