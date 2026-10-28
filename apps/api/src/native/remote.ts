import { accountEnvironment } from '../lib/model-preference';
import { providerToken, sendAPNS, type PushEnvironment } from '../push/delivery';
import { contactModelAllowed } from '../chat/consent';

export type RemoteContext = { deviceID: string; kinds: string[]; automaticKinds: string[]; remote: true };
export async function remoteContext(db: D1Database, userID: string, contactID: string, deviceID: string): Promise<RemoteContext | null> {
  const row = await db.prepare(`SELECT g.kinds_json AS kindsJSON FROM native_remote_device d
    JOIN native_remote_grant g ON g.device_id = d.id AND g.contact_id = ?2
    JOIN contact c ON c.id = g.contact_id AND c.user_id = d.user_id
    JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = d.user_id
    WHERE d.user_id = ?1 AND d.installation_id = ?3 AND s.expires_at > ?4`)
    .bind(userID, contactID, deviceID, Date.now()).first<{ kindsJSON: string }>();
  return row ? { deviceID, kinds: JSON.parse(row.kindsJSON), automaticKinds: JSON.parse(row.kindsJSON), remote: true } : null;
}
// Domain-separated, action-scoped capability. It grants no account or conversation access.
export async function remoteTicket(env: Env, id: string, nonce: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`wildcard-native-v1:${id}:${nonce}`))).toString('hex');
}
export async function validRemoteTicket(env: Env, id: string, nonce: string, ticket: string) {
  if (!/^[a-f0-9]{64}$/.test(ticket)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, Buffer.from(ticket, 'hex'), new TextEncoder().encode(`wildcard-native-v1:${id}:${nonce}`));
}
export async function deliverRemoteNative(env: PushEnvironment, actionID?: string) {
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) return;
  const now = Date.now();
  const { results } = await env.DB.prepare(`SELECT a.id, a.remote_nonce AS nonce, a.expires_at AS expiresAt,
    a.push_attempts AS attempts, t.user_id AS userID, t.contact_id AS contactID, d.installation_id AS deviceID,
    p.token, p.environment FROM native_action a JOIN chat_turn t ON t.id = a.turn_id
    JOIN native_remote_device d ON d.id = a.remote_device_id AND d.user_id = t.user_id
    JOIN native_remote_grant g ON g.device_id = d.id AND g.contact_id = t.contact_id
    JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    JOIN push_device p ON p.id = d.push_device_id JOIN session s ON s.id = p.session_id AND s.user_id = t.user_id
    WHERE a.status = 'pending' AND a.expires_at > ?1 AND a.push_next_at <= ?1 AND a.push_attempts < 3
      AND s.expires_at > ?1 AND (?2 IS NULL OR a.id = ?2)
    ORDER BY a.push_next_at LIMIT 10`).bind(now, actionID ?? null).all<{ id: string; nonce: string; expiresAt: number; attempts: number; userID: string; contactID: string; deviceID: string; token: string; environment: 'development' | 'production' }>();
  if (!results.length) return;
  const jwt = await providerToken(env);
  for (const item of results) {
    if (!await contactModelAllowed(await accountEnvironment(env, item.userID), item.contactID, item.userID)) continue;
    const claimed = await env.DB.prepare(`UPDATE native_action SET push_attempts = push_attempts + 1, push_next_at = ?2
      WHERE id = ?1 AND status = 'pending' AND push_next_at <= ?3 AND expires_at > ?3 RETURNING id`)
      .bind(item.id, now + 30_000, now).first();
    if (!claimed) continue;
    try {
      const ticket = await remoteTicket(env, item.id, item.nonce);
      const payload = JSON.stringify({ aps: { alert: { title: 'Wildcard', body: 'Preparing your requested timer or alarm…' }, 'mutable-content': 1 },
        nativeActionID: item.id, nativeTicket: ticket, userID: item.userID, contactID: item.contactID, deviceID: item.deviceID });
      const response = await sendAPNS(env, jwt, { ...item, collapseID: `native-${item.id}` }, payload);
      // Acceptance means transport only. A missing receipt never becomes execution success.
      if (response.ok) await env.DB.prepare('UPDATE native_action SET push_next_at = NULL WHERE id = ?').bind(item.id).run();
      else if ([400, 410, 413].includes(response.status)) await env.DB.prepare("UPDATE native_action SET status = 'failed', updated_at = ?2 WHERE id = ?1 AND status = 'pending'").bind(item.id, Date.now()).run();
    } catch { console.error(JSON.stringify({ event: 'native_push_deferred' })); }
  }
}
