import { decodeAppraisal } from './appraisal';
import { day, type Appraisal, type Observation, type Person, type PersonalityScope, type RelationshipObservation } from './types';

export async function readAudience(db: D1Database, s: PersonalityScope): Promise<{ people: Person[]; isolated: boolean }> {
  if (s.contactID) {
    const row = await db.prepare(`SELECT 'user:' || u.id AS id, u.name,
      EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id) AS isolated
      FROM contact c JOIN user u ON u.id = c.user_id
      WHERE c.id = ? AND c.agent_id = ? AND c.user_id = ?`)
      .bind(s.contactID, s.agentID, s.processingUserID).first<Person & { isolated: number }>();
    return { people: row ? [{ id: row.id, name: row.name }] : [], isolated: row?.isolated === 1 };
  }
  const { results } = await db.prepare(`SELECT 'user:' || u.id AS id, u.name,
      EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = m.group_id) AS isolated
    FROM group_member m JOIN user u ON u.id = m.user_id
    WHERE m.group_id = ?1 AND m.share_memory = 1
      AND EXISTS (SELECT 1 FROM group_agent ga WHERE ga.group_id = ?1 AND ga.agent_id = ?2)
      AND EXISTS (SELECT 1 FROM group_member viewer WHERE viewer.group_id = ?1 AND viewer.user_id = ?3 AND viewer.share_memory = 1)
    UNION ALL SELECT 'agent:' || a.id AS id, a.name,
      EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = ga.group_id) AS isolated
    FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id
    WHERE ga.group_id = ?1 AND a.id != ?2
      AND EXISTS (SELECT 1 FROM group_agent self WHERE self.group_id = ?1 AND self.agent_id = ?2)
      AND EXISTS (SELECT 1 FROM group_member viewer WHERE viewer.group_id = ?1 AND viewer.user_id = ?3 AND viewer.share_memory = 1)
    ORDER BY id LIMIT 25`).bind(s.groupID!, s.agentID, s.processingUserID).all<Person & { isolated: number }>();
  if (results.length > 24) return { people: [], isolated: true };
  return { people: results.map(({ id, name }) => ({ id, name })), isolated: results.some(r => r.isolated === 1) };
}

export async function localObservations(db: D1Database, s: PersonalityScope, revision: number, now: number): Promise<Observation[]> {
  const { results } = await db.prepare(`SELECT e.source_id AS sourceID, e.speaker_id AS speakerID,
    e.appraisal_json AS appraisal, e.created_at AS createdAt FROM personality_event e
    LEFT JOIN chat_turn t ON t.id = e.private_turn_id
    LEFT JOIN group_reply r ON r.id = e.group_reply_id
    LEFT JOIN group_message source ON source.id = r.source_id
    WHERE e.agent_id = ?1 AND e.profile_revision = ?2 AND e.created_at > ?3 AND e.created_at <= ?7
      AND (e.contributor = 0 OR ?4 = 1)
      AND ((e.contact_id = ?5 AND t.status = 'complete' AND t.assistant_text IS NOT NULL)
        OR (e.group_id = ?6 AND EXISTS (SELECT 1 FROM group_message published WHERE published.id = e.group_reply_id)
          AND EXISTS (SELECT 1 FROM group_member author WHERE author.group_id = e.group_id
            AND author.user_id = COALESCE(source.user_id, source.requester_id) AND author.share_memory = 1
            AND (?4 = 0 OR author.contributor_consent = 1))
          AND (source.agent_id IS NULL OR EXISTS (SELECT 1 FROM group_agent ga WHERE ga.group_id = e.group_id AND ga.agent_id = source.agent_id))
          AND (?4 = 0 OR source.contributor_consent = 1)))
    ORDER BY e.created_at DESC, e.source_id DESC LIMIT 64`)
    .bind(s.agentID, revision, now - 60 * day, (s.model ?? '').includes('contributor') ? 1 : 0,
      s.contactID ?? null, s.groupID ?? null, now).all<Observation>();
  return results;
}

// Server-only read model: no text, evidence quotes, source IDs, scope IDs or
// timestamps from this projection are serialized into the contact's prompt.
// Keeping provenance in the original event enables live deletion/revocation,
// unlike a lossy global summary that could retain a private cause forever.
export async function relationshipObservations(db: D1Database, s: PersonalityScope, people: Person[], revision: number,
  now: number, isolated: boolean, local: Observation[]): Promise<RelationshipObservation[]> {
  if (isolated) return [...local].reverse();
  const { results } = await db.prepare(`WITH eligible AS (
    SELECT e.speaker_id AS speakerID, e.appraisal_json AS appraisal, e.created_at AS createdAt,
      ROW_NUMBER() OVER (PARTITION BY e.speaker_id ORDER BY e.created_at DESC, e.source_id DESC) AS position
    FROM personality_event e JOIN contact_agent a ON a.id = e.agent_id
    LEFT JOIN chat_turn t ON t.id = e.private_turn_id
    LEFT JOIN contact c ON c.id = e.contact_id AND c.agent_id = a.id
    LEFT JOIN group_reply r ON r.id = e.group_reply_id
    LEFT JOIN group_message source ON source.id = r.source_id
    WHERE e.agent_id = ?1 AND e.speaker_id IN (SELECT value FROM json_each(?2))
      AND e.profile_revision = ?3 AND e.created_at > ?4 AND e.created_at <= ?6 AND json_extract(e.appraisal_json, '$.version') = 2
      AND (e.contributor = 0 OR ?5 = 1)
      AND ((c.id IS NOT NULL AND e.speaker_id = 'user:' || c.user_id
          AND t.contact_id = c.id AND t.user_id = c.user_id AND t.status = 'complete' AND t.assistant_text IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id)
          AND (?5 = 0 OR c.user_id = a.owner_id OR c.contributor_consent = 1))
        OR (r.agent_id = a.id AND r.group_id = e.group_id
          AND EXISTS (SELECT 1 FROM group_message published WHERE published.id = e.group_reply_id AND published.agent_id = a.id)
          AND EXISTS (SELECT 1 FROM group_agent self WHERE self.group_id = e.group_id AND self.agent_id = a.id)
          AND EXISTS (SELECT 1 FROM group_member author WHERE author.group_id = e.group_id
            AND author.user_id = COALESCE(source.user_id, source.requester_id) AND author.share_memory = 1
            AND (?5 = 0 OR author.contributor_consent = 1))
          AND (source.agent_id IS NULL OR EXISTS (SELECT 1 FROM group_agent actor WHERE actor.group_id = e.group_id AND actor.agent_id = source.agent_id))
          AND e.speaker_id = CASE WHEN source.agent_id IS NULL THEN 'user:' || source.user_id ELSE 'agent:' || source.agent_id END
          AND NOT EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = e.group_id)
          AND (?5 = 0 OR (source.contributor_consent = 1 AND NOT EXISTS (
            SELECT 1 FROM group_member member WHERE member.group_id = e.group_id AND member.contributor_consent = 0)))))
  ) SELECT speakerID, appraisal, createdAt FROM eligible WHERE position <= 64
    ORDER BY createdAt, speakerID, position DESC`)
    .bind(s.agentID, JSON.stringify(people.map(p => p.id)), revision, now - 60 * day,
      (s.model ?? '').includes('contributor') ? 1 : 0, now).all<RelationshipObservation>();
  return results;
}

export async function cachedAppraisal(db: D1Database, s: PersonalityScope, revision: number): Promise<Appraisal | null> {
  if (!s.sourceID) return null;
  const row = await db.prepare(`SELECT appraisal_json AS appraisal FROM personality_event
    WHERE agent_id = ? AND source_id = ? AND profile_revision = ? AND (contributor = 0 OR ? = 1)
      AND json_extract(appraisal_json, '$.version') = 2`)
    .bind(s.agentID, s.sourceID, revision, (s.model ?? '').includes('contributor') ? 1 : 0).first<{ appraisal: string }>();
  return row ? decodeAppraisal(row.appraisal) : null;
}

export async function storeAppraisal(db: D1Database, s: PersonalityScope, revision: number, value: Appraisal, now: number) {
  if (!s.sourceID) return;
  await db.prepare(`INSERT INTO personality_event
    (agent_id, source_id, contact_id, group_id, private_turn_id, group_reply_id, speaker_id,
      profile_revision, appraisal_json, created_at, contributor)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
    WHERE EXISTS (SELECT 1 FROM agent_personality p WHERE p.agent_id = ?1 AND p.revision = ?8)
      AND EXISTS (SELECT 1 FROM agent_attention a WHERE a.agent_id = ?1 AND a.turn_id = ?2 AND a.attempt = ?12)
      AND (EXISTS (SELECT 1 FROM chat_turn t JOIN contact c ON c.id = t.contact_id
          WHERE t.id = ?5 AND c.id = ?3 AND c.agent_id = ?1 AND c.user_id = ?13 AND t.user_id = c.user_id
            AND ?7 = 'user:' || c.user_id AND t.status = 'running')
        OR EXISTS (SELECT 1 FROM group_reply r JOIN group_message source ON source.id = r.source_id
          JOIN group_agent ga ON ga.group_id = r.group_id AND ga.agent_id = r.agent_id
          JOIN group_member author ON author.group_id = r.group_id AND author.user_id = COALESCE(source.user_id, source.requester_id)
          WHERE r.id = ?6 AND r.group_id = ?4 AND r.agent_id = ?1 AND r.status = 'running' AND author.share_memory = 1
            AND ?7 = CASE WHEN source.agent_id IS NULL THEN 'user:' || source.user_id ELSE 'agent:' || source.agent_id END
            AND (?11 = 0 OR (source.contributor_consent = 1 AND author.contributor_consent = 1))))
    ON CONFLICT(agent_id, source_id) DO UPDATE SET appraisal_json = excluded.appraisal_json,
      contributor = excluded.contributor, created_at = excluded.created_at, profile_revision = excluded.profile_revision
      WHERE (personality_event.contributor = 1 AND excluded.contributor = 0)
        OR COALESCE(json_extract(personality_event.appraisal_json, '$.version'), 0) != 2`)
    .bind(s.agentID, s.sourceID, s.contactID ?? null, s.groupID ?? null, s.contactID ? s.sourceID : null,
      s.groupID ? s.sourceID : null, s.speakerID, revision, JSON.stringify(value), now,
      (s.model ?? '').includes('contributor') ? 1 : 0, s.attempt ?? 1, s.processingUserID).run();
  await db.prepare(`DELETE FROM personality_event WHERE agent_id = ?1 AND (contact_id = ?2 OR group_id = ?3)
    AND source_id NOT IN (SELECT source_id FROM personality_event WHERE agent_id = ?1 AND (contact_id = ?2 OR group_id = ?3)
      AND created_at > ?4 ORDER BY created_at DESC, source_id DESC LIMIT 64)`)
    .bind(s.agentID, s.contactID ?? null, s.groupID ?? null, now - 60 * day).run();
}
