// Backend-for-frontend proxy. The browser never receives the bearer token: it
// lives in an httpOnly cookie and is attached here. Requests are rebuilt with an
// explicit header allowlist so browser cookies, Origin, and Fetch Metadata never
// reach Better Auth, and the client IP is preserved for API rate limits.
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const credentialPaths = new Set(['/api/v1/auth/sign-in/email', '/api/v1/auth/sign-up/email']);
const signOutPath = '/api/v1/auth/sign-out';
const responseHeaders = ['content-type', 'content-length', 'content-disposition', 'retry-after', 'x-content-type-options'];
const internalOrigin = 'https://wildcard-api.internal';

function reject(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function sameOrigin(event: Parameters<typeof getRequestURL>[0]) {
  const site = getRequestHeader(event, 'sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const origin = getRequestHeader(event, 'origin');
  return !origin || origin === getRequestURL(event).origin;
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event);
  const method = event.method.toUpperCase();
  if (!methods.has(method)) return reject(405, 'Method not allowed');
  if (!url.pathname.startsWith('/api/v1/') || /(^|\/)\.\.?(\/|$)|%2e|%2f|%5c/i.test(url.pathname)) {
    return reject(404, 'Not found');
  }
  // Cookies are SameSite=Strict; this also rejects cross-site state changes from
  // browsers that send cookies on top-level navigations.
  if (method !== 'GET' && !sameOrigin(event)) return reject(403, 'Cross-site request rejected');

  const isCredentialRequest = credentialPaths.has(url.pathname);
  const isSignOut = url.pathname === signOutPath;
  const token = readSessionToken(event);
  const headers = new Headers({ Accept: getRequestHeader(event, 'accept') || 'application/json' });
  const contentType = getRequestHeader(event, 'content-type');
  if (contentType) headers.set('Content-Type', contentType);
  if (token && !isCredentialRequest) headers.set('Authorization', `Bearer ${token}`);
  const clientIP = getRequestHeader(event, 'cf-connecting-ip');
  if (clientIP) headers.set('CF-Connecting-IP', clientIP);
  const binding = event.context.cloudflare?.env?.API as { fetch: typeof fetch } | undefined;
  let upstream: Response;
  try {
    // Nitro's Cloudflare adapter buffers POST/PUT/PATCH, but not DELETE. Reading
    // DELETE through H3's mock Node stream can wait forever; use the original
    // platform Request, whose body is still unread, including an empty body.
    const platformRequest = event.context.cloudflare?.request as Request | undefined;
    const raw = method === 'GET' ? undefined : method === 'DELETE' && platformRequest
      ? new Uint8Array(await platformRequest.arrayBuffer()) : await readRawBody(event, false);
    const body = raw?.byteLength ? Uint8Array.from(raw) : undefined;
    if (import.meta.dev) {
      // `nuxt dev` talks to `npm run dev` (wrangler dev) over HTTP. Node's fetch
      // always adds `Sec-Fetch-Mode`, which makes Better Auth require an Origin,
      // so name the local API's own (trusted) origin. Workers' fetch adds neither.
      const origin = useRuntimeConfig(event).apiOrigin;
      headers.set('Origin', new URL(origin).origin);
      upstream = await fetch(new URL(`${url.pathname}${url.search}`, origin), { method, headers, body });
    } else if (binding) {
      upstream = await binding.fetch(new Request(`${internalOrigin}${url.pathname}${url.search}`, { method, headers, body }));
    } else {
      console.error(JSON.stringify({ event: 'api_binding_missing' }));
      return reject(503, 'Service temporarily unavailable');
    }
  } catch {
    console.error(JSON.stringify({ event: 'api_proxy_failed' }));
    return reject(502, 'Service temporarily unavailable');
  }

  const forwarded = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of responseHeaders) {
    const value = upstream.headers.get(name);
    if (value) forwarded.set(name, value);
  }

  if (isSignOut || (url.pathname === '/api/v1/me' && method === 'DELETE' && upstream.ok)) {
    // A deleted account's sessions are gone with it.
    clearSessionToken(event);
  } else if (isCredentialRequest && upstream.ok) {
    const issued = upstream.headers.get('set-auth-token');
    if (!issued || !writeSessionToken(event, issued)) return reject(502, 'The server returned an unexpected response');
    // Better Auth also returns the unsigned session token in the body. Only the
    // user leaves this Worker.
    const result = await upstream.json().catch(() => null) as { user?: unknown } | null;
    if (!result?.user) return reject(502, 'The server returned an unexpected response');
    forwarded.delete('content-length');
    forwarded.set('Content-Type', 'application/json');
    return new Response(JSON.stringify({ user: result.user }), { status: upstream.status, headers: forwarded });
  } else if (upstream.status === 401 && token) {
    clearSessionToken(event);
  } else if (url.pathname === '/api/v1/me' && method === 'GET' && upstream.ok && token) {
    // Session use extends the server-side expiry; keep the cookie lifetime aligned.
    writeSessionToken(event, token);
  }
  return new Response(upstream.body, { status: upstream.status, headers: forwarded });
});
