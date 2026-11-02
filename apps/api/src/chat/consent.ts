import { privateContact } from '../mcp/client';
import { readSetting } from '../admin/settings';
export async function contactModelAllowed(env: Env, contactID: string, userID: string): Promise<boolean> {
  if (await privateContact(env.DB, contactID)) return true;
  if (!env.META_CHAT_MODEL.includes('contributor')) return true;
  return !!await env.DB.prepare(`SELECT c.id FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.id = ? AND c.user_id = ? AND (a.owner_id = c.user_id OR c.contributor_consent = 1)`)
    .bind(contactID, userID).first();
}

// Error bodies for sends refused because Contributor consent is missing. Clients
// localize them by `code`; `contributorOnly` says the admin flag caused Contributor.
export type ConsentCode = 'CONTACT_CONTRIBUTOR_CONSENT_REQUIRED' | 'GROUP_CONTRIBUTOR_CONSENT_REQUIRED';
export async function consentFailure(env: Env, code: ConsentCode, error: string, extra: Record<string, unknown> = {}) {
  return { error, code, contributorOnly: await readSetting(env.DB, 'contributor_only'), ...extra };
}

// Members whose missing Contributor consent blocks Contributor replies in a group.
export async function groupConsentMissing(db: D1Database, groupID: string, userID: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS missing, COALESCE(MAX(user_id = ?2), 0) AS self
    FROM group_member WHERE group_id = ?1 AND contributor_consent = 0`).bind(groupID, userID).first<{ missing: number; self: number }>();
  return row && row.missing > 0 ? { selfConsentMissing: row.self === 1, membersMissing: row.missing } : null;
}
