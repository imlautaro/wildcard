import { aliasMap } from '../contacts/alias';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { validEmoji, writeReaction, reactionColumns, reactionJoins, type Reaction } from './data';

export function reactionRoutes(group: boolean) {
  const routes = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
  const access = (id: string, owner: string) => group
    ? { sql: `EXISTS (SELECT 1 FROM group_member WHERE group_id = ? AND user_id = ?)`, values: [id, owner] }
    : { sql: `EXISTS (SELECT 1 FROM contact WHERE id = ? AND user_id = ?)`, values: [id, owner] };
  routes.get('/', async (c) => {
    const id = c.req.param('id')!, owner = c.get('owner');
    const permission = access(id, owner);
    if (!await c.env.DB.prepare(`SELECT 1 WHERE ${permission.sql}`).bind(...permission.values).first()) return c.json({ error: 'Conversation unavailable' }, 404);
    let ids: unknown;
    try { ids = JSON.parse(c.req.query('messageIDs') ?? 'null'); } catch { ids = null; }
    if (!Array.isArray(ids) || ids.length > 100 || !ids.length || ids.some((v) => typeof v !== 'string' || v.length > 160)) return c.json({ error: 'Provide 1–100 message IDs' }, 400);
    const target = group ? 'group_message_id' : 'turn_id';
    const visible = group
      ? `r.group_message_id IN (SELECT id FROM group_message WHERE group_id = ?)`
      : `r.turn_id IN (SELECT id FROM chat_turn WHERE contact_id = ? AND user_id = ?)`;
    const { results } = await c.env.DB.prepare(`SELECT ${reactionColumns} FROM message_reaction r ${reactionJoins}
      WHERE r.${target} IN (SELECT value FROM json_each(?)) AND ${visible} AND ${permission.sql}
      ORDER BY r.side, r.emoji, actorID`)
      .bind(JSON.stringify(ids), id, ...(group ? [] : [owner]), ...permission.values).all<Reaction>();
    // Reactions are viewer-facing, so contacts appear under this user's private alias.
    const aliases = await aliasMap(c.env.DB, owner, results.map(r => r.actorID.startsWith('agent/') ? r.actorID.slice(6) : null));
    return c.json({ reactions: results.map(r => ({ ...r, name: aliases.get(r.actorID.slice(6)) ?? r.name })) });
  });
  routes.put('/', bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
    const b = await c.req.json<Record<string, unknown>>().catch(() => null);
    if (!b || Object.keys(b).sort().join(',') !== 'emoji,messageID,side' || typeof b.messageID !== 'string' || b.messageID.length > 160
      || !(group ? b.side === 'group' : b.side === 'user' || b.side === 'assistant') || !validEmoji(b.emoji)) return c.json({ error: 'Provide a message ID, side and supported emoji or null' }, 400);
    const owner = c.get('owner'), id = c.req.param('id')!;
    const admission = await admitAuthRequest(c.env.DB, owner, 'message-reaction', 120);
    if (!admission.allowed) { c.header('Retry-After', String(admission.retryAfter)); return c.json({ error: 'Too many reactions' }, 429); }
    const permission = access(id, owner);
    const visible = group
      ? `EXISTS (SELECT 1 FROM group_message WHERE id = ? AND group_id = ?)`
      : `EXISTS (SELECT 1 FROM chat_turn WHERE id = ? AND contact_id = ? AND user_id = ?
          AND CASE WHEN ? = 'assistant' THEN assistant_text IS NOT NULL ELSE schedule_id IS NULL AND (user_text != '' OR attachment_json IS NOT NULL) END)`;
    const allowed = await writeReaction(c.env.DB, { id: b.messageID, side: b.side as 'user' | 'assistant' | 'group' },
      { id: owner, kind: 'user' }, b.emoji, { sql: `${visible} AND ${permission.sql}`,
        values: [b.messageID, id, ...(group ? [] : [owner, b.side as string]), ...permission.values] });
    return allowed ? c.json({ saved: true }) : c.json({ error: 'Message unavailable' }, 404);
  });
  return routes;
}
