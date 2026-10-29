import type { H3Event } from 'h3';

// Same shape as apps/web/server/utils/session.ts, with its own cookie name so the
// admin session never collides with a Wildcard web session. The API remains the
// authority on expiry.
const maxAge = 60 * 60 * 24 * 7;
const signedToken = /^[A-Za-z0-9._~+/=-]{16,1024}$/;

// Deployed Workers are HTTPS-only, so production always uses a Secure __Host-
// cookie. Only `nuxt dev` over HTTP uses a plain name.
const secure = !import.meta.dev;
const cookieName = secure ? '__Host-wildcard_admin_session' : 'wildcard_admin_session';

export function readSessionToken(event: H3Event): string | null {
  const token = getCookie(event, cookieName);
  return token && signedToken.test(token) ? token : null;
}

export function writeSessionToken(event: H3Event, token: string): boolean {
  if (!signedToken.test(token)) return false;
  setCookie(event, cookieName, token, {
    httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge,
  });
  return true;
}

export function clearSessionToken(event: H3Event) {
  deleteCookie(event, cookieName, { httpOnly: true, secure, sameSite: 'strict', path: '/' });
}
