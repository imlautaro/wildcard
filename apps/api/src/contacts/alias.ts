// A contact's alias is private to the user who set it (contact.alias on that user's own
// row). These helpers resolve what one viewer should read; bot-facing prompts, shared
// contacts and other members keep using the shared name.

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
