import { birthdayFacts, defaultPersonality, parsePersonality, type PersonalitySnapshot } from '../../../../shared/personality';

export async function readPersonality(db: D1Database, agentID: string, now = Date.now()): Promise<PersonalitySnapshot> {
  const row = await db.prepare('SELECT profile_json AS profile, revision FROM agent_personality WHERE agent_id = ?')
    .bind(agentID).first<{ profile: string; revision: number }>();
  const personality = row ? parsePersonality(JSON.parse(row.profile), now, true) ?? defaultPersonality() : defaultPersonality();
  return { personality, revision: row?.revision ?? 0, ...birthdayFacts(personality, now) };
}
