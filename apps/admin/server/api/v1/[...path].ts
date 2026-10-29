// Backend-for-frontend proxy, modeled on apps/web. The browser never receives the
// bearer token: it lives in an httpOnly cookie and is attached here. Only sign-in,
// sign-out and /api/v1/admin/* are forwarded; the API's AdminAPI entrypoint checks
// the super admin roster on every admin request.
const methods = new Set(['GET', 'POST', 'PUT', 'DELETE']);
const signInPath = '/api/v1/auth/sign-in/email';
const signOutPath = '/api/v1/auth/sign-out';
const adminPrefix = '/api/v1/admin/';
const responseHeaders = ['content-type', 'content-length', 'retry-after', 'x-content-type-options'];
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
  if (/(^|\/)\.\.?(\/|$)|%2e|%2f|%5c/i.test(url.pathname)) return reject(404, 'Not found');
  const isSignIn = url.pathname === signInPath && method === 'POST';
  const isSignOut = url.pathname === signOutPath && method === 'POST';
  if (!isSignIn && !isSignOut && !url.pathname.startsWith(adminPrefix)) return reject(404, 'Not found');
  // Cookies are SameSite=Strict; this also rejects cross-site state changes from
  // browsers that send cookies on top-level navigations.
  if (method !== 'GET' && !sameOrigin(event)) return reject(403, 'Cross-site request rejected');

  const token = readSessionToken(event);
  const headers = new Headers({ Accept: 'application/json' });
  const contentType = getRequestHeader(event, 'content-type');
  if (contentType) headers.set('Content-Type', contentType);
  if (token && !isSignIn) headers.set('Authorization', `Bearer ${token}`);
  const clientIP = getRequestHeader(event, 'cf-connecting-ip');
  if (clientIP) headers.set('CF-Connecting-IP', clientIP);
  const raw = method === 'GET' ? undefined : await readRawBody(event, false);
  const body = raw ? Uint8Array.from(raw) : undefined;

  const binding = event.context.cloudflare?.env?.API as { fetch: typeof fetch } | undefined;
  let upstream: Response;
  try {
    if (import.meta.dev) {
      // `nuxt dev` talks to `wrangler dev`, which mounts the admin routes on the
      // public app only with ADMIN_LOCAL_ROUTES=true. See apps/web for the Origin.
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

  if (isSignOut) {
    clearSessionToken(event);
  } else if (isSignIn && upstream.ok) {
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
  } else if (url.pathname === '/api/v1/admin/session' && upstream.ok && token) {
    // Session use extends the server-side expiry; keep the cookie lifetime aligned.
    writeSessionToken(event, token);
  }
  return new Response(upstream.body, { status: upstream.status, headers: forwarded });
});
