import { privateSharingTools, searchAuthorizedPrivateMessages } from './private-sharing';
import { readAgentMemories, selectAgentMemories } from '../chat/agent-memory';
import { groupMemories, localGroupMemories } from './memory';
import { byteLength, clipText, keywords, selectMemories } from '../chat/memory';
import { rankMemories } from '../chat/semantic-memory';
import { agentHistoryStart, userHistoryStart } from './history-access';
import { isRecord, type ModelTool, type ToolCall } from '../chat/meta';

export type GroupRetrievalScope = { agentID: string; userID: string; contributor: boolean; groupID?: string; contactID?: string; beforeSequence?: number; reactionJob?: { turnID: string; attempt: number }; mcp?: { id: string; attempt: number; contactID: string; userID: string; groupID: string; agentID: string } };
export const groupRetrievalTools: ModelTool[] = [
  ...privateSharingTools,
  { type: 'function', function: { name: 'search_group_memories',
    description: 'Search attributed human memories available to this agent. In a group this includes that group’s local memories; local memories never leave their source group. Uses lexical matching.',
    parameters: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string' } } } } },
  { type: 'function', function: { name: 'search_self_memories',
    description: 'Retrieve your shared persona and your current conversation’s local preferences, attributed to your agent ID. Local memories cannot be retrieved from another conversation. Never retrieves another agent’s private preferences.',
    parameters: { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string' } } } } },
  { type: 'function', function: { name: 'search_groups',
    description: 'Find shared groups and their current human/agent identities. Optional query matches group or member names. Use before guessing who another bot is. Paginate with after.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string' }, after: { type: 'string', description: 'Exclusive group ID cursor returned by this tool.' },
    } } } },
  { type: 'function', function: { name: 'get_group_excerpt',
    description: 'Read a group message and nearby statements by other speakers using a messageID returned by search. Use after finding a question to see the bots’ answers, or to read later portions of clipped text with offset.',
    parameters: { type: 'object', additionalProperties: false, required: ['messageID'], properties: {
      messageID: { type: 'string' }, offset: { type: 'integer' },
    } } } },
  { type: 'function', function: { name: 'search_group_messages',
    description: 'Search original shared group statements by humans and bots, including your own replies. Lexical search: use original words or speaker names; omit query for recent messages. Never searches private chats. Use groupID from search_groups and before for older results.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string' }, groupID: { type: 'string' }, before: { type: 'integer' },
    } } } },
];

// Private retrieval requires BOTH the agent and the current human in the source
// group. In group replies the scope is restricted to that one audience's group.
const access = `EXISTS (SELECT 1 FROM group_agent ga JOIN group_member member ON member.group_id = ga.group_id
  WHERE ga.group_id = g.id AND ga.agent_id = ?1 AND member.user_id = ?2 AND member.share_memory = 1
    AND (?3 = 0 OR member.contributor_consent = 1)) AND (?4 IS NULL OR g.id = ?4)
  AND (g.id = ?4 OR NOT EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = g.id))`;

// Past-history access: the agent never reads before its own join; in private retrieval
// (no current group, ?4 NULL) neither does the human it is talking to.
const messageAccess = `${access} AND gm.sequence < ?6
    AND gm.sequence >= ${agentHistoryStart('gm.group_id', '?1')}
    AND (?4 IS NOT NULL OR gm.sequence >= ${userHistoryStart('gm.group_id', '?2')})
    AND (?3 = 0 OR gm.contributor_consent = 1)
    AND (gm.user_id IS NULL OR EXISTS (SELECT 1 FROM group_member author
      WHERE author.group_id = gm.group_id AND author.user_id = gm.user_id AND author.share_memory = 1
      AND (?3 = 0 OR author.contributor_consent = 1)))
    AND (gm.agent_id IS NULL OR EXISTS (SELECT 1 FROM group_agent author
      WHERE author.group_id = gm.group_id AND author.agent_id = gm.agent_id))`;

function pack(rows: Record<string, unknown>[]) {
  const results: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (byteLength(JSON.stringify({ results: [...results, row], truncated: true })) > 3600) break;
    results.push(row);
  }
  return { results, truncated: results.length < rows.length };
}

export async function sharedGroups(db: D1Database, scope: GroupRetrievalScope, query = '', after = '') {
  const terms = keywords(query);
  // LIKE patterns are bound and escaped; matching is deliberately lexical.
  const filters = terms.map((_, i) => `(g.name LIKE ?${i + 6} ESCAPE '\\' OR EXISTS (
    SELECT 1 FROM group_agent ga JOIN contact_agent a ON a.id = ga.agent_id
    WHERE ga.group_id = g.id AND a.name LIKE ?${i + 6} ESCAPE '\\') OR EXISTS (
    SELECT 1 FROM group_member gm JOIN user u ON u.id = gm.user_id
    WHERE gm.group_id = g.id AND u.name LIKE ?${i + 6} ESCAPE '\\'))`);
  const { results: groups } = await db.prepare(`SELECT g.id AS groupID, g.name FROM group_agent mine JOIN chat_group g ON g.id = mine.group_id
    WHERE mine.agent_id = ?1 AND ${access} AND g.id > ?5 ${filters.length ? `AND (${filters.join(' OR ')})` : ''}
    ORDER BY g.id LIMIT 3`).bind(scope.agentID, scope.userID, scope.contributor ? 1 : 0, scope.groupID ?? null,
      after, ...terms.map((term) => `%${term.replace(/[\\%_]/g, '\\$&')}%`)).all<{ groupID: string; name: string }>();
  const rows: Record<string, unknown>[] = [];
  // Two groups per page; names/IDs are bounded separately from stored values.
  for (const group of groups.slice(0, 2)) {
    const { results: members } = await db.prepare(`SELECT a.id, a.name, 'agent' AS kind FROM group_agent ga
      JOIN contact_agent a ON a.id = ga.agent_id WHERE ga.group_id = ?1
      UNION ALL SELECT u.id, u.name, 'human' AS kind FROM group_member gm JOIN user u ON u.id = gm.user_id
      WHERE gm.group_id = ?1 LIMIT 25`).bind(group.groupID).all<{ id: string; name: string; kind: string }>();
    members.sort((a, b) => {
      const score = (name: string) => terms.filter((term) => name.normalize('NFKC').toLowerCase().includes(term)).length;
      return score(b.name) - score(a.name) || Number(b.kind === 'agent') - Number(a.kind === 'agent');
    });
    rows.push({ groupID: group.groupID, name: clipText(group.name, 140),
      members: members.slice(0, 24).map((m) => ({ ...m, name: clipText(m.name, 100) })), membersTruncated: members.length > 24 });
  }
  // Pack members incrementally so a large valid group never disappears entirely.
  for (const row of rows) {
    while (byteLength(JSON.stringify(row)) > 1650 && Array.isArray(row.members) && row.members.length) {
      row.members.pop(); row.membersTruncated = true;
    }
  }
  const packed = pack(rows);
  return { ...packed, hasMore: groups.length > 2 || packed.truncated,
    nextAfter: packed.results.at(-1)?.groupID ?? null };
}

export async function searchGroupMessages(db: D1Database, scope: GroupRetrievalScope, query = '', groupID?: string, before?: number) {
  const terms = keywords(query);
  const match = terms.map((term) => `"${term}"*`).join(' OR ');
  const { results } = await db.prepare(`SELECT gm.sequence, gm.id AS messageID, g.id AS groupID,
    g.name AS groupName, gm.user_id AS userID, gm.agent_id AS agentID, gm.sender_name AS senderName,
    ${match ? "snippet(group_message_search, 0, '', '', ' … ', 48)" : 'gm.text'} AS text, gm.created_at AS createdAt
    FROM group_message gm JOIN chat_group g ON g.id = gm.group_id
    ${match ? 'JOIN group_message_search ON group_message_search.rowid = gm.sequence' : ''}
    WHERE ${messageAccess} AND gm.group_id IN (
      SELECT ga.group_id FROM group_agent ga JOIN group_member member ON member.group_id = ga.group_id
      WHERE ga.agent_id = ?1 AND member.user_id = ?2 AND member.share_memory = 1
      AND (?3 = 0 OR member.contributor_consent = 1)) AND (?5 IS NULL OR g.id = ?5)
    ${match ? 'AND group_message_search MATCH ?7' : ''}
    ORDER BY gm.sequence DESC LIMIT 5`).bind(scope.agentID, scope.userID, scope.contributor ? 1 : 0,
      scope.groupID ?? null, groupID ?? null, Math.min(before ?? Number.MAX_SAFE_INTEGER, scope.beforeSequence ?? Number.MAX_SAFE_INTEGER),
      ...(match ? [match] : [])).all<Record<string, unknown>>();
  const packed = pack(results.slice(0, 4).map((r) => ({ ...r, groupName: clipText(String(r.groupName), 140),
    senderName: clipText(String(r.senderName), 100), text: clipText(String(r.text), 600), textTruncated: true })));
  return { ...packed, hasMore: results.length > 4 || packed.truncated, nextBefore: packed.results.at(-1)?.sequence ?? null };
}

async function groupExcerpt(db: D1Database, scope: GroupRetrievalScope, messageID: string, offset: number) {
  const { results } = await db.prepare(`WITH center AS (
    SELECT gm.sequence, gm.group_id FROM group_message gm JOIN chat_group g ON g.id = gm.group_id
    WHERE gm.id = ?5 AND ${messageAccess}),
    earlier AS (SELECT gm.sequence FROM center JOIN group_message gm ON gm.group_id = center.group_id
      JOIN chat_group g ON g.id = gm.group_id WHERE ${messageAccess} AND gm.sequence < center.sequence
      ORDER BY gm.sequence DESC LIMIT 2),
    later AS (SELECT gm.sequence FROM center JOIN group_message gm ON gm.group_id = center.group_id
      JOIN chat_group g ON g.id = gm.group_id WHERE ${messageAccess} AND gm.sequence > center.sequence
      ORDER BY gm.sequence ASC LIMIT 2)
    SELECT gm.id AS messageID, gm.sequence, gm.group_id AS groupID, gm.sender_name AS senderName,
      gm.user_id AS userID, gm.agent_id AS agentID, gm.text, gm.created_at AS createdAt
    FROM group_message gm JOIN chat_group g ON g.id = gm.group_id WHERE ${messageAccess}
    AND gm.sequence IN (SELECT sequence FROM center UNION ALL SELECT sequence FROM earlier UNION ALL SELECT sequence FROM later)
    ORDER BY (gm.id = ?5) DESC, gm.sequence LIMIT 5`)
    .bind(scope.agentID, scope.userID, scope.contributor ? 1 : 0, scope.groupID ?? null, messageID,
      scope.beforeSequence ?? Number.MAX_SAFE_INTEGER)
    .all<Record<string, unknown>>();
  if (!results.length) return { error: 'Message not found.' };
  return pack(results.map((r) => {
    const tail = Array.from(String(r.text)).slice(offset).join('');
    const text = clipText(tail, 600);
    const truncated = byteLength(tail) > 600;
    return { ...r, senderName: clipText(String(r.senderName), 100), text, offset,
      textTruncated: truncated, nextOffset: truncated ? offset + Array.from(text).length - 1 : null };
  }));
}

export async function executeGroupRetrieval(db: D1Database, scope: GroupRetrievalScope, call: ToolCall, env?: Env): Promise<string> {
  const args: unknown = JSON.parse(call.function.arguments);
  if (!isRecord(args) || (args.query !== undefined && (typeof args.query !== 'string' || byteLength(args.query) > 256))) {
    return JSON.stringify({ error: 'Provide an optional query of at most 256 UTF-8 bytes.' });
  }
  if (call.function.name === 'search_authorized_private_messages') {
    return JSON.stringify(await searchAuthorizedPrivateMessages(db, scope, args));
  }
  if (call.function.name === 'get_group_excerpt') {
    if (Object.keys(args).some((k) => !['messageID', 'offset'].includes(k)) || typeof args.messageID !== 'string'
      || !args.messageID || args.messageID.length > 100 || (args.offset !== undefined &&
        (typeof args.offset !== 'number' || !Number.isSafeInteger(args.offset) || args.offset < 0 || args.offset > 20000))) {
      return JSON.stringify({ error: 'Provide a messageID and optional character offset from 0 to 20000.' });
    }
    return JSON.stringify(await groupExcerpt(db, scope, args.messageID, typeof args.offset === 'number' ? args.offset : 0));
  }
  if (call.function.name === 'search_self_memories') {
    if (Object.keys(args).some((k) => k !== 'query') || typeof args.query !== 'string' || !args.query.trim()) {
      return JSON.stringify({ error: 'Provide a nonempty query.' });
    }
    return JSON.stringify(pack(selectAgentMemories(await readAgentMemories(db, scope.agentID, scope.contributor, scope.userID, scope.groupID ? { groupID: scope.groupID } : scope.contactID ? { contactID: scope.contactID } : undefined), args.query).slice(0, 8)));
  }
  if (call.function.name === 'search_group_memories') {
    if (Object.keys(args).some((k) => k !== 'query') || typeof args.query !== 'string' || !args.query.trim()) {
      return JSON.stringify({ error: 'Provide a nonempty query.' });
    }
    const local = scope.groupID && !scope.contributor
      ? await localGroupMemories(db, scope.agentID, scope.groupID, scope.userID, scope.beforeSequence) : [];
    const shared = await groupMemories(db, scope.agentID, scope.contributor);
    // Semantic ranking only for non-isolated groups; private callers rank their own tool separately.
    const isolated = !scope.groupID || !!await db.prepare('SELECT 1 FROM mcp_private_group WHERE group_id = ?').bind(scope.groupID).first();
    return JSON.stringify(pack(env ? await rankMemories(env, [...local, ...shared], args.query, false, !isolated) : selectMemories([...local, ...shared], args.query)));
  }
  if (call.function.name === 'search_groups') {
    if (Object.keys(args).some((k) => !['query', 'after'].includes(k))
      || (args.after !== undefined && (typeof args.after !== 'string' || args.after.length > 100))) return JSON.stringify({ error: 'Invalid group cursor.' });
    return JSON.stringify(await sharedGroups(db, scope, args.query as string | undefined, args.after as string | undefined));
  }
  if (call.function.name === 'search_group_messages') {
    if (Object.keys(args).some((k) => !['query', 'groupID', 'before'].includes(k))
      || (args.groupID !== undefined && (typeof args.groupID !== 'string' || args.groupID.length > 100))
      || (args.before !== undefined && (typeof args.before !== 'number' || !Number.isSafeInteger(args.before) || args.before < 0))) {
      return JSON.stringify({ error: 'Invalid group ID or sequence cursor.' });
    }
    return JSON.stringify(await searchGroupMessages(db, scope, args.query as string | undefined,
      args.groupID as string | undefined, args.before as number | undefined));
  }
  return JSON.stringify({ error: 'Unknown group retrieval tool.' });
}
