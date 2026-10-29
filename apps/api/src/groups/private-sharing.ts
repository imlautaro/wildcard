import { byteLength, clipText, keywords } from '../chat/memory';
import type { ModelTool } from '../chat/meta';
import type { GroupRetrievalScope } from './retrieval';

// Bound parameters are always server-resolved agent/group/model identities.
const access = `s.group_id = ?1 AND s.agent_id = ?2 AND c.agent_id = s.agent_id
  AND c.user_id = s.user_id AND a.memory_shared = 1
  AND member.share_memory = 1
  AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = c.id)
  AND (?3 = 0 OR ((c.user_id = a.owner_id OR c.contributor_consent = 1)
    AND member.contributor_consent = 1))`;
const joins = `FROM group_private_sharing s
  JOIN contact c ON c.id = s.contact_id
  JOIN contact_agent a ON a.id = c.agent_id
  JOIN group_agent ga ON ga.group_id = s.group_id AND ga.agent_id = s.agent_id
  JOIN group_member member ON member.group_id = s.group_id AND member.user_id = s.user_id
  JOIN user u ON u.id = s.user_id`;

export async function privateSharingSources(db: D1Database, groupID: string, agentID: string, contributor: boolean) {
  const { results } = await db.prepare(`SELECT s.user_id AS userID, u.name ${joins} WHERE ${access} ORDER BY s.user_id LIMIT 16`)
    .bind(groupID, agentID, contributor ? 1 : 0).all<{ userID: string; name: string }>();
  return results;
}

export const privateSharingTools: ModelTool[] = [{ type: 'function', function: {
  name: 'search_authorized_private_messages',
  description: 'Read private text that its author explicitly permits you to discuss with everyone in THIS group. Use when asked about something learned privately, including recent temporary plans that memory extraction may omit. Only consenting sources are searched. Omit query for recent turns; use userID to select a person, before to paginate, or turnID and offset to read a clipped result. Attachments, schedules and connector chats remain inaccessible.',
  parameters: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string' }, userID: { type: 'string' }, before: { type: 'integer' },
    turnID: { type: 'string' }, offset: { type: 'integer' },
  } },
} }];

export async function searchAuthorizedPrivateMessages(db: D1Database, scope: GroupRetrievalScope, args: Record<string, unknown>) {
  if (!scope.groupID) return { error: 'Available only in the authorized group.' };
  if (Object.keys(args).some(k => !['query', 'userID', 'before', 'turnID', 'offset'].includes(k))
    || ['query', 'userID', 'turnID'].some(k => args[k] !== undefined && (typeof args[k] !== 'string' || byteLength(args[k] as string) > 256))
    || ['before', 'offset'].some(k => args[k] !== undefined && (typeof args[k] !== 'number' || !Number.isSafeInteger(args[k]) || (args[k] as number) < 0))
    || (typeof args.offset === 'number' && args.offset > 20000)) return { error: 'Invalid search arguments.' };
  const terms = keywords(typeof args.query === 'string' ? args.query : '');
  const match = terms.map(term => `"${term}"*`).join(' OR ');
  const { results } = await db.prepare(`SELECT t.id AS turnID, t.sequence, s.user_id AS userID,
    u.name AS sourceName, t.user_text AS userText, t.assistant_text AS assistantText, t.created_at AS createdAt
    ${joins} JOIN chat_turn t ON t.contact_id = c.id AND t.user_id = c.user_id
    ${match ? 'JOIN chat_turn_search ON chat_turn_search.rowid = t.sequence' : ''}
    WHERE ${access} AND t.status = 'complete' AND t.schedule_id IS NULL AND t.group_request_id IS NULL
      AND (?4 IS NULL OR s.user_id = ?4) AND t.sequence < ?5 AND (?6 IS NULL OR t.id = ?6)
      ${match ? 'AND chat_turn_search MATCH ?7' : ''}
    ORDER BY t.sequence DESC LIMIT 5`)
    .bind(scope.groupID, scope.agentID, scope.contributor ? 1 : 0, args.userID ?? null,
      args.before ?? Number.MAX_SAFE_INTEGER, args.turnID ?? null, ...(match ? [match] : []))
    .all<{ turnID: string; sequence: number; userID: string; sourceName: string; userText: string; assistantText: string; createdAt: number }>();
  const offset = typeof args.offset === 'number' ? args.offset : 0;
  const packed: Record<string, unknown>[] = [];
  for (const row of results.slice(0, 4)) {
    const excerpt = (value: string) => {
      const tail = Array.from(value).slice(offset).join('');
      const text = clipText(tail, 320);
      const truncated = byteLength(tail) > 320;
      return { text, truncated, nextOffset: truncated ? offset + Array.from(text).length - 1 : null };
    };
    const item = { ...row, sourceName: clipText(row.sourceName, 100),
      userText: excerpt(row.userText), assistantText: excerpt(row.assistantText), offset };
    if (byteLength(JSON.stringify([...packed, item])) > 3600) break;
    packed.push(item);
  }
  return { results: packed, hasMore: results.length > packed.length,
    nextBefore: packed.at(-1)?.sequence ?? null, authorizedAudience: scope.groupID };
}
