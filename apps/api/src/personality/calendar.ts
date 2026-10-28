import { localDate, type Personality } from '../../../../shared/personality';
import { decodeAppraisal } from './appraisal';
import { day, type Appraisal, type Observation, type PersonalityScope, type RelationshipObservation } from './types';

// Find a civil day's first instant without assuming a 24-hour day or a fixed
// UTC offset. This also tolerates a midnight skipped by a timezone transition.
function startOfCivilDay(date: string, timeZone: string): number {
  const center = Date.parse(date);
  let low = center - 36 * 3_600_000, high = center + 36 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(middle, timeZone) < date) low = middle; else high = middle;
  }
  return high;
}

// Only a small temporary reaction leaves this function. A missed greeting, its
// date, scope, or inferred cause never enters the acting prompt.
export async function birthdayReaction(db: D1Database, s: PersonalityScope, profile: Personality,
  local: Observation[], relationship: RelationshipObservation[], current: Appraisal, now: number): Promise<number> {
  if (!s.sourceID || !profile.birthDate || profile.traits.sensitivity < 8
    || ['repair', 'affection', 'distress'].includes(current.kind) || ['serious', 'practical'].includes(current.topic)) return 0;
  const today = localDate(now, profile.timeZone);
  const year = Number(today.slice(0, 4));
  const anniversary = (y: number) => {
    const leap = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1;
    return `${y}-${profile.birthDate!.slice(5) === '02-29' && !leap ? '02-28' : profile.birthDate!.slice(5)}`;
  };
  const date = [anniversary(year), anniversary(year - 1)].find(date => {
    const ago = (Date.parse(today) - Date.parse(date)) / day;
    return ago >= 1 && ago <= 7;
  });
  if (!date) return 0;
  const actorHistory = relationship.filter(e => e.speakerID === s.speakerID);
  if (actorHistory.some(e => localDate(e.createdAt, profile.timeZone) === date && decodeAppraisal(e.appraisal).kind === 'birthday')) return 0;
  if (actorHistory.some(e => localDate(e.createdAt, profile.timeZone) > date
    && ['repair', 'affection', 'celebration'].includes(decodeAppraisal(e.appraisal).kind))) return 0;
  const actorEvents = local.filter(e => e.speakerID === s.speakerID && localDate(e.createdAt, profile.timeZone) === date);
  if (!actorEvents.length || actorEvents.some(e => {
    const a = decodeAppraisal(e.appraisal);
    return !a.complete || a.confidence < 0.7 || a.disappointment > 0 || a.kind === 'birthday';
  })) return 0;
  // Include failed/batched inputs: missing appraisals cannot prove an omission.
  const query = s.contactID
    ? db.prepare(`SELECT t.id, t.created_at AS createdAt FROM chat_turn t WHERE t.contact_id = ?1
        AND t.created_at > ?2 AND t.created_at < ?3 AND t.user_text != '' AND t.schedule_id IS NULL
        AND t.group_request_id IS NULL AND t.id != ?4 ORDER BY t.created_at DESC LIMIT 65`)
      .bind(s.contactID, now - 8 * day, now, s.sourceID)
    : db.prepare(`SELECT r.id, source.created_at AS createdAt FROM group_reply r
        JOIN group_message source ON source.id = r.source_id
        WHERE r.group_id = ?1 AND r.agent_id = ?2 AND source.created_at > ?3 AND source.created_at < ?4
          AND r.id != ?5 AND CASE WHEN source.agent_id IS NULL THEN 'user:' || source.user_id ELSE 'agent:' || source.agent_id END = ?6
        ORDER BY source.created_at DESC LIMIT 65`)
      .bind(s.groupID!, s.agentID, now - 8 * day, now, s.sourceID, s.speakerID);
  const { results: rows } = await query.all<{ id: string; createdAt: number }>();
  if (rows.length >= 65) return 0;
  const onBirthday = rows.filter(r => localDate(r.createdAt, profile.timeZone) === date);
  if (!onBirthday.length || onBirthday.some(r => !actorEvents.some(e => e.sourceID === r.id))) return 0;
  // One omission episode, not a fresh disappointment on every subsequent turn.
  if (actorHistory.some(e => localDate(e.createdAt, profile.timeZone) > date && decodeAppraisal(e.appraisal).disappointment > 0)) return 0;
  // The omission is only observable after the birthday ends. Do not let it decay
  // during the birthday itself before a missed greeting could be known.
  const followingDate = new Date(Date.parse(date) + day).toISOString().slice(0, 10);
  const since = Math.max(0, now - startOfCivilDay(followingDate, profile.timeZone));
  const pendingHalfLife = (12 + (11 - profile.traits.resilience) * 6) * 3_600_000;
  return 0.24 * Math.pow(0.5, since / pendingHalfLife);
}
