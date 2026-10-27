import { totalUnreadReplies } from '../lib/unread';
import { pushPhotoURL } from '../photos/push-access';
import { replyPayload } from './payload';

// Optional until the installation has configured its own Apple provider key.
export type PushEnvironment = Env & {
  APNS_PRIVATE_KEY?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_TOPIC?: string;
};
type Delivery = {
  turnID: string; deviceID: string; sessionID: string; token: string;
  environment: 'development' | 'production'; contactID: string; userID: string;
  attempts: number; expiresAt: number;
};

export function enqueueReply(db: D1Database, turnID: string, attempt: number, now: number) {
  return db.prepare(`INSERT OR IGNORE INTO push_delivery
    (turn_id, device_id, session_id, next_at, expires_at)
    SELECT t.id, d.id, d.session_id, ?1, ?2 FROM chat_turn t
    JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
    JOIN session s ON s.user_id = t.user_id AND s.expires_at > ?1
    JOIN push_device d ON d.session_id = s.id
    WHERE t.id = ?3 AND t.attempt = ?4 AND t.status = 'complete' AND t.sequence > c.last_read_sequence`)
    .bind(now, now + 86_400_000, turnID, attempt);
}

async function providerToken(env: PushEnvironment): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: env.APNS_KEY_ID })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const input = `${header}.${claims}`;
  const pem = env.APNS_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const encoded = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  // Workers' node:crypto sign rejects PrivateKeyObject in this path. Import PKCS#8 directly.
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

export async function deliverPush(env: PushEnvironment, turnID?: string) {
  const now = Date.now();
  await env.DB.prepare(`DELETE FROM push_delivery WHERE expires_at <= ? OR attempts >= 8
    OR NOT EXISTS (SELECT 1 FROM push_device d JOIN session s ON s.id = d.session_id
      WHERE d.id = push_delivery.device_id AND d.session_id = push_delivery.session_id AND s.expires_at > ?)
    OR EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
      WHERE t.id = push_delivery.turn_id AND t.sequence <= c.last_read_sequence)`)
    .bind(now, now).run();
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) return;
  const { results } = await env.DB.prepare(`SELECT p.turn_id AS turnID, p.device_id AS deviceID,
    p.session_id AS sessionID, d.token, d.environment, t.contact_id AS contactID,
    t.user_id AS userID, p.attempts, p.expires_at AS expiresAt
    FROM push_delivery p JOIN push_device d ON d.id = p.device_id AND d.session_id = p.session_id
    JOIN session s ON s.id = p.session_id AND s.expires_at > ?1
    JOIN chat_turn t ON t.id = p.turn_id AND t.user_id = s.user_id
    WHERE p.next_at <= ?1 AND (?2 IS NULL OR p.turn_id = ?2)
    ORDER BY p.next_at LIMIT 30`).bind(now, turnID ?? null).all<Delivery>();
  if (!results.length) return;
  // One fresh provider JWT per bounded batch; never cache I/O across invocations.
  let jwt: string;
  try { jwt = await providerToken(env); }
  catch {
    console.error(JSON.stringify({ event: 'push_provider_signing_failed' }));
    return;
  }
  for (let offset = 0; offset < results.length; offset += 5) {
    const outcomes = await Promise.allSettled(results.slice(offset, offset + 5).map(async (item) => {
      // Atomic lease prevents concurrent Workflow/Cron sends. Retry after a crash.
      const claim = await env.DB.prepare(`UPDATE push_delivery SET next_at = ?, attempts = attempts + 1
        WHERE turn_id = ? AND device_id = ? AND session_id = ? AND next_at <= ?
        AND EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
          WHERE t.id = push_delivery.turn_id AND t.sequence > c.last_read_sequence)
        RETURNING turn_id`)
        .bind(now + 120_000, item.turnID, item.deviceID, item.sessionID, now).first();
      if (!claim) return;
      const alert = await env.DB.prepare(`SELECT c.name AS contactName, c.photo_version AS photoVersion, t.assistant_text AS reply
        FROM chat_turn t JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
        WHERE t.id = ? AND t.user_id = ? AND t.status = 'complete'
          AND t.sequence > c.last_read_sequence`)
        .bind(item.turnID, item.userID).first<{ contactName: string; photoVersion: string | null; reply: string }>();
      if (!alert) return;
      const photoURL = alert.photoVersion
        ? await pushPhotoURL(env, item.contactID, alert.photoVersion, item.sessionID, item.expiresAt) : undefined;
      const unreadCount = await totalUnreadReplies(env.DB, item.userID);
      const host = item.environment === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
      const response = await fetch(`https://${host}/3/device/${item.token}`, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
        headers: {
          authorization: `bearer ${jwt}`, 'content-type': 'application/json',
          'apns-topic': env.APNS_TOPIC!, 'apns-push-type': 'alert', 'apns-priority': '10',
          'apns-expiration': String(Math.floor(item.expiresAt / 1000)), 'apns-collapse-id': item.turnID,
        },
        body: replyPayload({ ...alert, turnID: item.turnID, photoURL, unreadCount, contactID: item.contactID, userID: item.userID }),
      });
      // Only inspect Apple's bounded reason field; never log tokens or message data.
      let reason: string | undefined;
      if (!response.ok) {
        const reader = response.body?.getReader();
        try {
          const chunk = await reader?.read();
          if (chunk?.value && chunk.value.byteLength <= 2048) {
            try { reason = (JSON.parse(new TextDecoder().decode(chunk.value)) as { reason?: string }).reason; } catch { /* Retry safely. */ }
          }
        } finally { await reader?.cancel(); }
      } else { await response.body?.cancel(); }
      if (response.status === 410 || (response.status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason ?? ''))) {
        await env.DB.prepare('DELETE FROM push_device WHERE id = ? AND session_id = ?')
          .bind(item.deviceID, item.sessionID).run();
      } else if (response.ok || (response.status === 400 && reason === 'PayloadEmpty') || response.status === 413) {
        await env.DB.prepare('DELETE FROM push_delivery WHERE turn_id = ? AND device_id = ? AND session_id = ?')
          .bind(item.turnID, item.deviceID, item.sessionID).run();
        if (response.ok) console.log(JSON.stringify({ event: 'push_accepted', environment: item.environment }));
      } else {
        console.error(JSON.stringify({ event: 'push_delivery_deferred', status: response.status, reason: reason && /^[A-Za-z]{1,80}$/.test(reason) ? reason : 'Unknown' }));
        await env.DB.prepare('UPDATE push_delivery SET next_at = ? WHERE turn_id = ? AND device_id = ? AND session_id = ?')
          .bind(Date.now() + Math.min(3_600_000, 60_000 * 2 ** item.attempts), item.turnID, item.deviceID, item.sessionID).run();
      }
    }));
    if (outcomes.some((outcome) => outcome.status === 'rejected')) {
      console.error(JSON.stringify({ event: 'push_batch_deferred' }));
    }
  }
}
