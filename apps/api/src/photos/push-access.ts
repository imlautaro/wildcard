import { Hono } from 'hono';
import { photoResponse } from './storage';

async function signingKey(env: Env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
const message = (contact: string, version: string, session: string, expires: string) =>
  new TextEncoder().encode(JSON.stringify(['contact-push-photo-v1', contact, version, session, expires]));

export async function pushPhotoURL(env: Env, contact: string, version: string, session: string, expiresAt: number) {
  const expires = String(Math.min(expiresAt, Date.now() + 86_400_000));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env), message(contact, version, session, expires));
  const url = new URL(`/api/v1/push-photos/${encodeURIComponent(contact)}`, env.BETTER_AUTH_URL);
  url.search = new URLSearchParams({ version, session, expires, signature: Buffer.from(signature).toString('hex') }).toString();
  return url.toString();
}

const photos = new Hono<{ Bindings: Env }>();
photos.get('/:id', async (c) => {
  const { version, session, expires, signature } = c.req.query();
  const id = c.req.param('id');
  if (!version || !session || !expires || !/^\d{13}$/.test(expires) ||
      Number(expires) <= Date.now() || Number(expires) > Date.now() + 86_400_000 ||
      !signature || !/^[a-f0-9]{64}$/.test(signature)) return c.body(null, 404);
  const valid = await crypto.subtle.verify('HMAC', await signingKey(c.env), Buffer.from(signature, 'hex'),
    message(id, version, session, expires));
  if (!valid) return c.body(null, 404);
  const row = await c.env.DB.prepare(`SELECT a.owner_id AS owner, a.id AS agentID FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    JOIN session s ON s.user_id = c.user_id WHERE c.id = ? AND c.photo_version = ?
    AND s.id = ? AND s.expires_at > ?`).bind(id, version, session, Date.now()).first<{ owner: string; agentID: string }>();
  if (!row) return c.body(null, 404);
  return photoResponse(c.env, row.owner, row.agentID, version);
});
export default photos;
