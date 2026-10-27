import { privateContact } from '../mcp/client';
export async function contactModelAllowed(env: Env, contactID: string, userID: string): Promise<boolean> {
  if (await privateContact(env.DB, contactID)) return true;
  if (!env.META_CHAT_MODEL.includes('contributor')) return true;
  return !!await env.DB.prepare(`SELECT c.id FROM contact c JOIN contact_agent a ON a.id = c.agent_id
    WHERE c.id = ? AND c.user_id = ? AND (a.owner_id = c.user_id OR c.contributor_consent = 1)`)
    .bind(contactID, userID).first();
}
