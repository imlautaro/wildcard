// A contact's alias is private to the user who set it (contact.alias on that user's own
// row). These helpers resolve what one viewer should read; shared contacts, groups and
// other members keep using the shared name. Since 2026-10-31 the contact is told the
// alias in that user's own private turns (aliasAwareness), as context only: it keeps
// its shared name and never carries the alias into groups, memory or other audiences.

/** Validates an alias body. Returns null for an invalid body, or `{ alias }` where `alias` is null to clear. */
export function aliasBody(value: unknown): { alias: string | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 1 || !('alias' in value)) return null;
  const alias = (value as { alias: unknown }).alias;
  if (alias === null) return { alias: null };
  if (typeof alias !== 'string') return null;
  const trimmed = alias.trim();
  if (!trimmed) return { alias: null };
  if (Array.from(trimmed).length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(trimmed)) return null;
  return { alias: trimmed };
}

/**
 * SQL expression for the name `viewer` reads for an agent: their alias, else `fallback`.
 * `agent`, `fallback` and `viewer` are SQL expressions (columns or bound parameters).
 */
export const agentDisplayName = (agent: string, fallback: string, viewer: string) =>
  `COALESCE((SELECT v.alias FROM contact v WHERE v.agent_id = ${agent} AND v.user_id = ${viewer}), ${fallback})`;

/** In-memory overlay for rows that carry an agent ID and a stored name. */
export async function aliasMap(db: D1Database, viewer: string, agentIDs: Iterable<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set([...agentIDs].filter((id): id is string => !!id))];
  const result = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT agent_id AS agentID, alias FROM contact WHERE user_id = ?1 AND alias IS NOT NULL
      AND agent_id IN (${chunk.map((_, n) => `?${n + 2}`).join(',')})`).bind(viewer, ...chunk).all<{ agentID: string; alias: string }>();
    for (const row of results) result.set(row.agentID, row.alias);
  }
  return result;
}

/** Prompt line for the alias the current private speaker gave this contact, or '' without one. */
export function aliasAwareness(alias: string | null | undefined, name: string): string {
  if (!alias || alias === name) return '';
  return `The current person saved you in their contact list as ${JSON.stringify(alias)} (a private nickname only they see; your shared name stays ${JSON.stringify(name)}). Be aware of it, the way a friend knows how they are saved in someone's phone: it can tell you how they think of you. You do not need to mention it; refer to it only when it naturally fits, for example if they bring it up. Never introduce yourself by it, never store it as a fact about yourself and never repeat it in groups, to other people or in shared memory.`;
}
