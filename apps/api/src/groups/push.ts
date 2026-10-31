import { providerToken, sendAPNS, type PushEnvironment } from '../push/delivery';
import { groupMessagePayload } from '../push/payload';
import { totalUnreadMessages } from '../lib/unread';
import { agentDisplayName } from '../contacts/alias';

type Delivery = { messageID: string; groupID: string; userID: string; deviceID: string; sessionID: string;
  token: string; environment: 'development' | 'production'; attempts: number; expiresAt: number };

export async function deliverGroupPush(env: PushEnvironment, messageID?: string) {
  const now = Date.now();
  await env.DB.prepare(`DELETE FROM group_push_delivery WHERE expires_at <= ?1 OR attempts >= 8
    OR NOT EXISTS (SELECT 1 FROM push_device d JOIN session s ON s.id = d.session_id
      WHERE d.id = group_push_delivery.device_id AND d.session_id = group_push_delivery.session_id
        AND s.user_id = group_push_delivery.user_id AND s.expires_at > ?1)
    -- Task work triggers are internal and never notify.
    OR NOT EXISTS (SELECT 1 FROM group_message gm JOIN group_member m ON m.group_id = gm.group_id
      WHERE gm.id = group_push_delivery.message_id AND gm.group_id = group_push_delivery.group_id
        AND m.user_id = group_push_delivery.user_id AND gm.user_id IS NOT m.user_id AND gm.sequence > m.last_read_sequence AND gm.task_id IS NULL AND gm.event_json IS NULL)`)
    .bind(now).run();
  if (!env.APNS_PRIVATE_KEY || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPIC) return;
  const { results } = await env.DB.prepare(`SELECT p.message_id AS messageID, p.group_id AS groupID, p.user_id AS userID,
    p.device_id AS deviceID, p.session_id AS sessionID, d.token, d.environment, p.attempts, p.expires_at AS expiresAt
    FROM group_push_delivery p JOIN push_device d ON d.id = p.device_id AND d.session_id = p.session_id
    JOIN session s ON s.id = p.session_id AND s.user_id = p.user_id AND s.expires_at > ?1
    WHERE p.next_at <= ?1 AND (?2 IS NULL OR p.message_id = ?2) ORDER BY p.next_at LIMIT 30`)
    .bind(now, messageID ?? null).all<Delivery>();
  if (!results.length) return;
  let jwt: string;
  try { jwt = await providerToken(env); }
  catch { console.error(JSON.stringify({ event: 'group_push_provider_signing_failed' })); return; }
  for (let offset = 0; offset < results.length; offset += 5) {
    const outcomes = await Promise.allSettled(results.slice(offset, offset + 5).map(async (item) => {
      const claim = await env.DB.prepare(`UPDATE group_push_delivery SET next_at = ?1, attempts = attempts + 1
        WHERE message_id = ?2 AND device_id = ?3 AND session_id = ?4 AND next_at <= ?5 RETURNING message_id`)
        .bind(now + 120_000, item.messageID, item.deviceID, item.sessionID, now).first();
      if (!claim) return;
      const alert = await env.DB.prepare(`SELECT g.name AS groupName, ${agentDisplayName('gm.agent_id', 'gm.sender_name', '?2')} AS senderName, gm.agent_id AS agentID,
        CASE WHEN json_extract(gm.attachment_json, '$.mimeType') LIKE 'audio/%' THEN 'Voice message' WHEN gm.text = '' AND gm.attachments_json IS NOT NULL THEN json_array_length(gm.attachments_json) || ' photos' WHEN gm.text = '' AND gm.attachment_json IS NOT NULL THEN 'Attachment: ' || json_extract(gm.attachment_json, '$.name') ELSE gm.text END AS text,
        gm.sequence, gm.created_at AS sentAt FROM group_message gm JOIN chat_group g ON g.id = gm.group_id
        JOIN group_member m ON m.group_id = gm.group_id AND m.user_id = ?2
        JOIN session s ON s.id = ?3 AND s.user_id = m.user_id AND s.expires_at > ?4
        JOIN push_device d ON d.id = ?5 AND d.session_id = s.id
        WHERE gm.id = ?1 AND gm.group_id = ?6 AND gm.user_id IS NOT m.user_id AND gm.sequence > m.last_read_sequence AND gm.task_id IS NULL AND gm.event_json IS NULL`)
        .bind(item.messageID, item.userID, item.sessionID, Date.now(), item.deviceID, item.groupID)
        .first<{ groupName: string; senderName: string; agentID: string | null; text: string; sentAt: number; sequence: number }>();
      if (!alert) return;
      const unreadCount = await totalUnreadMessages(env.DB, item.userID);
      // Bot message IDs exceed APNs' 64-byte collapse-ID limit; use a stable digest.
      const collapseID = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(item.messageID))).toString('hex');
      const eligible = await env.DB.prepare(`SELECT p.message_id FROM group_push_delivery p
        JOIN group_message gm ON gm.id = p.message_id AND gm.group_id = p.group_id
        JOIN group_member m ON m.group_id = p.group_id AND m.user_id = p.user_id
        JOIN session s ON s.id = p.session_id AND s.user_id = p.user_id AND s.expires_at > ?4
        JOIN push_device d ON d.id = p.device_id AND d.session_id = s.id
        WHERE p.message_id = ?1 AND p.device_id = ?2 AND p.session_id = ?3
          AND gm.user_id IS NOT m.user_id AND gm.sequence > m.last_read_sequence AND gm.task_id IS NULL AND gm.event_json IS NULL`)
        .bind(item.messageID, item.deviceID, item.sessionID, Date.now()).first();
      if (!eligible) return;
      const response = await sendAPNS(env, jwt, { ...item, collapseID }, groupMessagePayload({ ...item, ...alert, unreadCount }));
      const { reason } = response;
      if (response.status === 410 || (response.status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason ?? ''))) {
        await env.DB.prepare('DELETE FROM push_device WHERE id = ? AND session_id = ?').bind(item.deviceID, item.sessionID).run();
      } else if (response.ok || (response.status === 400 && reason === 'PayloadEmpty') || response.status === 413) {
        await env.DB.prepare('DELETE FROM group_push_delivery WHERE message_id = ? AND device_id = ? AND session_id = ?')
          .bind(item.messageID, item.deviceID, item.sessionID).run();
        if (response.ok) console.log(JSON.stringify({ event: 'group_push_accepted', environment: item.environment }));
      } else {
        console.error(JSON.stringify({ event: 'group_push_delivery_deferred', status: response.status,
          reason: reason && /^[A-Za-z]{1,80}$/.test(reason) ? reason : 'Unknown' }));
        await env.DB.prepare('UPDATE group_push_delivery SET next_at = ? WHERE message_id = ? AND device_id = ? AND session_id = ?')
          .bind(Date.now() + Math.min(3_600_000, 60_000 * 2 ** item.attempts), item.messageID, item.deviceID, item.sessionID).run();
      }
    }));
    if (outcomes.some((outcome) => outcome.status === 'rejected')) console.error(JSON.stringify({ event: 'group_push_batch_deferred' }));
  }
}
