import { dispatchChat } from '../chat/dispatch';
import { storedColumns, type StoredTurn } from '../chat/data';
import { deliverScheduledPrivateMessage } from '../chat/private-relay';

export async function dispatchSchedules(env: Env) {
  if (!env.META_API_KEY?.trim()) return;
  const now = Date.now();
  // Every schedule waits for the owner's chat to be idle: a new turn would end a
  // multi-message reply in progress, including the delivery note of a private message.
  const { results } = await env.DB.prepare(`SELECT id, revision, next_at AS nextAt,
    interval_seconds AS intervalSeconds, contact_id AS contactID, user_id AS userID,
    recipient_user_id AS recipientUserID, instruction FROM contact_schedule s
    WHERE status = 'active' AND next_at <= ? AND NOT EXISTS
      (SELECT 1 FROM chat_turn t WHERE t.contact_id = s.contact_id AND t.status IN ('queued', 'running'))
    ORDER BY next_at LIMIT 50`).bind(now)
    .all<{ id: string; revision: number; nextAt: number; intervalSeconds: number | null; contactID: string; userID: string; recipientUserID: string | null; instruction: string }>();
  for (let offset = 0; offset < results.length; offset += 5) {
    await Promise.all(results.slice(offset, offset + 5).map(async (schedule) => {
      try {
        // Coalesce missed intervals into the latest due occurrence, anchored to the original start.
        const interval = schedule.intervalSeconds === null ? null : schedule.intervalSeconds * 1000;
        const due = interval === null ? schedule.nextAt
          : schedule.nextAt + Math.floor((now - schedule.nextAt) / interval) * interval;
        if (schedule.recipientUserID) {
          await deliverScheduledPrivateMessage(env, { ...schedule, recipientUserID: schedule.recipientUserID, due });
          return;
        }
        const id = crypto.randomUUID();
        const turn = await env.DB.prepare(`INSERT INTO chat_turn
          (id, contact_id, user_id, user_text, status, workflow_id, created_at, updated_at,
            time_zone, schedule_id, schedule_revision, scheduled_at, schedule_instruction)
          SELECT ?1, s.contact_id, s.user_id, '', 'queued', ?2, ?3, ?3,
            s.time_zone, s.id, s.revision, ?4, s.instruction FROM contact_schedule s
          WHERE s.id = ?5 AND s.revision = ?6 AND s.status = 'active' AND s.next_at = ?7
            AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = s.contact_id AND status IN ('queued','running'))
            AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = s.user_id AND status IN ('queued','running')) < 10
          ON CONFLICT DO NOTHING RETURNING ${storedColumns}`)
          .bind(id, `chat-${id}-a1`, now, due, schedule.id, schedule.revision, schedule.nextAt).first<StoredTurn>();
        if (turn) await dispatchChat(env, turn);
      } catch { console.error(JSON.stringify({ event: 'schedule_dispatch_deferred' })); }
    }));
  }
}
