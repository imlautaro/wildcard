import type { RemoteTool } from '../mcp/client';
import { clipText } from '../chat/memory';
import { cardKinds, type CardKind } from './cards';

// What Home knows about one person, gathered only from their own rows: their
// contacts, what those contacts remember about them, their own recent messages,
// connectors, mini apps, schedules and Home feedback. Other participants'
// memories of shared agents are never read here, nor connector-isolated chats and
// groups, whose history never reaches a Contributor-capable call.
export type HomeContact = { id: string; name: string; description: string; specialties: string; connectors: string[]; lastAt: number | null };
export type HomeTopicRow = { id: string; title: string; brief: string; reason: string | null; kind: CardKind; source: 'person' | 'contact' | 'curator';
  contactID: string | null; status: 'active' | 'hidden' | 'retired'; feedback: 'more' | 'less' | null; pinned: number; updatedAt: number; skips: number; skipReason: string | null };
export type HomeCardRow = { topicID: string; kind: CardKind; contactID: string | null; payloadJSON: string; generatedAt: number; expiresAt: number };
export type HomeSignals = {
  userName: string; timeZone: string; now: number;
  contacts: HomeContact[];
  memories: { contact: string; kind: string; content: string; updatedAt: number }[];
  messages: { to: string; text: string; at: number }[];
  connectors: { id: string; name: string; tools: { name: string; description: string }[] }[];
  miniApps: { title: string; opens: number }[];
  schedules: { instruction: string; nextAt: number; repeats: boolean }[];
  topics: HomeTopicRow[];
  cards: HomeCardRow[];
};

// Reads only. Home never runs a tool a server or its name marks as a change.
const readVerbs = new Set(['get', 'list', 'search', 'fetch', 'read', 'query', 'find', 'lookup', 'describe', 'show', 'count',
  'view', 'retrieve', 'summary', 'summarize', 'stats', 'report', 'current', 'latest', 'price', 'prices', 'rate', 'rates', 'balance', 'quote']);
const writeVerbs = new Set(['create', 'update', 'delete', 'remove', 'send', 'post', 'put', 'patch', 'pay', 'transfer', 'write', 'insert',
  'add', 'set', 'cancel', 'book', 'order', 'buy', 'sell', 'move', 'archive', 'upload', 'submit', 'approve', 'reject', 'invite', 'share',
  'publish', 'reset', 'clear', 'mark', 'toggle', 'start', 'stop', 'run', 'execute', 'trigger', 'edit', 'save', 'import', 'sync', 'charge', 'refund']);
export function homeReadable(tool: Pick<RemoteTool, 'name' | 'allowed'> & { readOnly?: boolean }): boolean {
  if (!tool.allowed) return false;
  const words = tool.name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some(word => writeVerbs.has(word))) return false;
  return tool.readOnly === true || readVerbs.has(words[0] ?? '');
}

function profile(json: string | null): { description: string; specialties: string } {
  try {
    const value = json ? JSON.parse(json) as { description?: unknown; specialties?: unknown } : {};
    return { description: typeof value.description === 'string' ? clipText(value.description, 400) : '',
      specialties: typeof value.specialties === 'string' ? clipText(value.specialties, 300) : '' };
  } catch { return { description: '', specialties: '' }; }
}

export async function homeTimeZone(db: D1Database, userID: string): Promise<string> {
  const row = await db.prepare(`SELECT COALESCE((SELECT time_zone FROM home_feed WHERE user_id = ?1),
    (SELECT time_zone FROM chat_turn WHERE user_id = ?1 AND time_zone IS NOT NULL ORDER BY created_at DESC LIMIT 1)) AS zone`)
    .bind(userID).first<{ zone: string | null }>();
  try { if (row?.zone) { new Intl.DateTimeFormat('en-US', { timeZone: row.zone }); return row.zone; } } catch { /* fall through */ }
  return 'UTC';
}

export const topicColumns = `id, title, brief, reason, kind, source, contact_id AS contactID, status, feedback, pinned, updated_at AS updatedAt,
  skips, skip_reason AS skipReason`;

export async function readSignals(db: D1Database, userID: string): Promise<HomeSignals | null> {
  const user = await db.prepare('SELECT name FROM user WHERE id = ?').bind(userID).first<{ name: string }>();
  if (!user) return null;
  const [contacts, access, memories, messages, groupMessages, connectors, miniApps, schedules, topics, cards, timeZone] = await Promise.all([
    db.prepare(`SELECT c.id, c.name, p.profile_json AS profile,
        (SELECT MAX(t.created_at) FROM chat_turn t WHERE t.contact_id = c.id) AS lastAt
      FROM contact c LEFT JOIN agent_personality p ON p.agent_id = c.agent_id
      WHERE c.user_id = ? AND c.archived_at IS NULL AND c.clearing = 0
      ORDER BY lastAt IS NULL, lastAt DESC, c.created_at DESC LIMIT 12`).bind(userID)
      .all<{ id: string; name: string; profile: string | null; lastAt: number | null }>(),
    db.prepare(`SELECT a.contact_id AS contactID, m.name FROM mcp_contact_access a JOIN mcp_connector m ON m.id = a.connection_id
      WHERE m.user_id = ?`).bind(userID).all<{ contactID: string; name: string }>(),
    db.prepare(`SELECT c.name AS contact, m.kind, m.content, m.updated_at AS updatedAt FROM contact_memory m
      JOIN contact c ON c.id = m.contact_id AND c.user_id = m.user_id
      WHERE m.user_id = ? AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = m.contact_id)
      ORDER BY m.updated_at DESC LIMIT 60`).bind(userID)
      .all<{ contact: string; kind: string; content: string; updatedAt: number }>(),
    db.prepare(`SELECT c.name AS recipient, t.user_text AS text, t.created_at AS at FROM chat_turn t
      JOIN contact c ON c.id = t.contact_id AND c.user_id = t.user_id
      WHERE t.user_id = ? AND t.status = 'complete' AND t.user_text != ''
        AND t.schedule_id IS NULL AND t.task_id IS NULL AND t.group_request_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM mcp_private_contact p WHERE p.contact_id = t.contact_id)
      ORDER BY t.sequence DESC LIMIT 30`).bind(userID).all<{ recipient: string; text: string; at: number }>(),
    db.prepare(`SELECT g.name AS recipient, m.text, m.created_at AS at FROM group_message m
      JOIN chat_group g ON g.id = m.group_id
      JOIN group_member member ON member.group_id = m.group_id AND member.user_id = m.user_id
      WHERE m.user_id = ? AND m.text != '' AND NOT EXISTS (SELECT 1 FROM mcp_private_group p WHERE p.group_id = m.group_id)
      ORDER BY m.sequence DESC LIMIT 12`).bind(userID)
      .all<{ recipient: string; text: string; at: number }>(),
    db.prepare('SELECT id, name, tools_json AS toolsJSON FROM mcp_connector WHERE user_id = ? ORDER BY name LIMIT 8').bind(userID)
      .all<{ id: string; name: string; toolsJSON: string }>(),
    db.prepare(`SELECT a.title, COALESCE(u.opens, 0) AS opens FROM mini_app a
      LEFT JOIN mini_app_usage u ON u.app_id = a.id AND u.user_id = ?1
      WHERE a.user_id = ?1 ORDER BY opens DESC, a.updated_at DESC LIMIT 10`).bind(userID).all<{ title: string; opens: number }>(),
    db.prepare(`SELECT instruction, next_at AS nextAt, interval_seconds AS interval FROM contact_schedule
      WHERE user_id = ? AND status = 'active' ORDER BY next_at LIMIT 10`).bind(userID)
      .all<{ instruction: string; nextAt: number; interval: number | null }>(),
    db.prepare(`SELECT ${topicColumns} FROM home_topic WHERE user_id = ? AND status != 'retired' ORDER BY updated_at DESC LIMIT 40`)
      .bind(userID).all<HomeTopicRow>(),
    db.prepare(`SELECT topic_id AS topicID, kind, contact_id AS contactID, payload_json AS payloadJSON, generated_at AS generatedAt,
      expires_at AS expiresAt FROM home_card WHERE user_id = ? ORDER BY position`).bind(userID).all<HomeCardRow>(),
    homeTimeZone(db, userID),
  ]);
  return {
    userName: user.name, timeZone, now: Date.now(),
    contacts: contacts.results.map(row => ({ id: row.id, name: row.name, ...profile(row.profile), lastAt: row.lastAt,
      connectors: access.results.filter(item => item.contactID === row.id).map(item => item.name) })),
    memories: memories.results.map(row => ({ ...row, content: clipText(row.content, 300) })),
    messages: [...messages.results, ...groupMessages.results].sort((a, b) => b.at - a.at).slice(0, 36)
      .map(row => ({ to: row.recipient, text: clipText(row.text, 240), at: row.at })),
    connectors: connectors.results.map(row => ({ id: row.id, name: row.name,
      tools: (JSON.parse(row.toolsJSON) as RemoteTool[]).filter(homeReadable).slice(0, 24)
        .map(tool => ({ name: tool.name, description: clipText(tool.description, 160) })) }))
      .filter(row => row.tools.length),
    miniApps: miniApps.results,
    schedules: schedules.results.map(row => ({ instruction: clipText(row.instruction, 200), nextAt: row.nextAt, repeats: row.interval !== null })),
    topics: topics.results.filter(row => (cardKinds as readonly string[]).includes(row.kind)),
    cards: cards.results,
  };
}
