export type ScheduleScope = { contactID: string; userID: string };
export type ContactSchedule = {
  id: string; instruction: string; timeZone: string; nextAt: number;
  intervalSeconds: number | null; status: 'active' | 'completed' | 'cancelled';
  revision: number; createdAt: number; updatedAt: number;
  // Set when another participant receives the exact instruction text (docs/schedules.md).
  recipientUserID: string | null; recipientName?: string | null;
};
export const scheduleColumns = `id, instruction, time_zone AS timeZone, next_at AS nextAt,
  interval_seconds AS intervalSeconds, status, revision, created_at AS createdAt, updated_at AS updatedAt,
  recipient_user_id AS recipientUserID`;

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 100 || !value.trim()) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return true; }
  catch { return false; }
}

export async function listSchedules(db: D1Database, scope: ScheduleScope,
  options: { hideDeliveredOnce?: boolean } = {}) {
  // Keep history for model tools and retain the row for cancellation/push checks.
  const visible = options.hideDeliveredOnce ? `AND NOT (status = 'completed' AND interval_seconds IS NULL
    AND EXISTS (SELECT 1 FROM chat_turn t WHERE t.schedule_id = contact_schedule.id
      AND t.schedule_revision = contact_schedule.revision AND t.contact_id = contact_schedule.contact_id
      AND t.user_id = contact_schedule.user_id AND t.status = 'complete'
      -- A private message stays visible until its delivery receipt exists.
      AND (contact_schedule.recipient_user_id IS NULL
        OR EXISTS (SELECT 1 FROM private_contact_message WHERE source_turn_id = t.id))))` : '';
  const { results } = await db.prepare(`SELECT ${scheduleColumns},
    (SELECT name FROM user WHERE id = contact_schedule.recipient_user_id) AS recipientName FROM contact_schedule
    WHERE contact_id = ? AND user_id = ? ${visible}
    ORDER BY status = 'active' DESC, created_at DESC LIMIT 100`)
    .bind(scope.contactID, scope.userID).all<ContactSchedule>();
  return results;
}

// Use in the final write and immediately before push, not only before inference.
export function scheduleAllowed(table: string) {
  return `(${table}.schedule_id IS NULL OR EXISTS (SELECT 1 FROM contact_schedule cs
    WHERE cs.id = ${table}.schedule_id AND cs.contact_id = ${table}.contact_id AND cs.user_id = ${table}.user_id
    AND cs.status != 'cancelled' AND cs.revision = ${table}.schedule_revision))`;
}
