import type { Personality } from '../../../../shared/personality';
import { seenGapReaction } from './director';
import { clamp, type Person, type PersonalityScope, type RelationshipState } from './types';

export async function applyLiveSeenGaps(db: D1Database, profile: Personality, s: PersonalityScope, people: Person[],
  states: Map<Person['id'], RelationshipState>, revision: number, now: number, isolated: boolean) {
  if (isolated || !people.some(person => person.id.startsWith('user:'))) return;
  // Metadata only. A newer human message means the person already answered;
  // a pending reply cannot keep a seen grievance alive. No legacy/imported gap.
  const { results } = await db.prepare(`SELECT 'user:' || c.user_id AS personID,
      t.updated_at AS repliedAt, c.last_reply_read_at AS readAt
    FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    JOIN chat_turn t ON t.contact_id = c.id AND t.user_id = c.user_id
    JOIN personality_event e ON e.private_turn_id = t.id AND e.agent_id = a.id
    WHERE a.id = ?1 AND 'user:' || c.user_id IN (SELECT value FROM json_each(?2))
      AND e.profile_revision = ?3 AND json_extract(e.appraisal_json, '$.version') = 2
      AND (e.contributor = 0 OR ?4 = 1) AND (?4 = 0 OR c.user_id = a.owner_id OR c.contributor_consent = 1)
      AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id)
      AND t.status = 'complete' AND t.assistant_text IS NOT NULL AND c.last_read_sequence >= t.sequence
      AND c.last_reply_read_at >= t.updated_at AND c.last_reply_read_at <= ?5
      AND t.sequence = (SELECT MAX(last.sequence) FROM chat_turn last
        WHERE last.contact_id = c.id AND last.status = 'complete' AND last.assistant_text IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM chat_turn newer WHERE newer.contact_id = c.id
        AND newer.sequence > t.sequence AND newer.user_text != '' AND newer.schedule_id IS NULL AND newer.group_request_id IS NULL)`)
    .bind(s.agentID, JSON.stringify(people.map(p => p.id)), revision, (s.model ?? '').includes('contributor') ? 1 : 0, now)
    .all<{ personID: Person['id']; repliedAt: number; readAt: number | null }>();
  for (const row of results) {
    const state = states.get(row.personID);
    if (state) state.tension = clamp(state.tension + seenGapReaction(profile, row, now));
  }
}
