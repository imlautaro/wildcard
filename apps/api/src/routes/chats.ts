import { dispatchVisit } from '../chat/visits';
import { readPresence } from '../chat/presence';
import { totalUnreadReplies } from '../lib/unread';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { findTurn, publicTurn, storedColumns, turnColumns, type ChatTurn, type StoredTurn } from '../chat/data';
import { normalizedRecording, transcribeRecording, TranscriptionFailure } from '../chat/transcription';
import { dispatchChat } from '../chat/dispatch';
import { admitAuthRequest } from '../lib/auth-rate-limit';

const chats = new Hono<{ Bindings: Env; Variables: { owner: string; contactID: string } }>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const messageBody = bodyLimit({ maxSize: 32768, onError: (c) => c.json({ error: 'Request body too large' }, 413) });
chats.use('*', async (c, next) => {
  const id = c.req.param('id');
  if (!id || !await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?')
    .bind(id, c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  c.set('contactID', id);
  await next();
});
// Activity contains no draft text. Each foreground visit has a client UUID.
chats.post('/activity', bodyLimit({ maxSize: 1024,
  onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'kind,visitID'
    || typeof body.visitID !== 'string' || !uuid.test(body.visitID)
    || typeof body.kind !== 'string' || !['open', 'typing', 'leave'].includes(body.kind)) {
    return c.json({ error: 'Provide a visit UUID and open, typing, or leave activity' }, 400);
  }
  const owner = c.get('owner');
  const contactID = c.get('contactID');
  const id = body.visitID.toLowerCase();
  const admission = await admitAuthRequest(c.env.DB, owner, 'chat-activity', 120);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too much activity' }, 429);
  }
  const now = Date.now();
  if (body.kind === 'open') {
    const opens = await admitAuthRequest(c.env.DB, owner, 'chat-visits', 20);
    if (!opens.allowed) {
      c.header('Retry-After', String(opens.retryAfter));
      return c.json({ error: 'Too many visits' }, 429);
    }
    await c.env.DB.prepare(`INSERT INTO chat_visit
      (id, contact_id, user_id, ready_at, expires_at, updated_at)
      SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM contact WHERE id = ?2 AND user_id = ?3)
      AND (SELECT COUNT(*) FROM chat_visit WHERE user_id = ?3 AND closed = 0 AND expires_at > ?6) < 10
      ON CONFLICT(id) DO NOTHING`)
      .bind(id, contactID, owner, now + 3000, now + 33000, now).run();
  } else if (body.kind === 'typing') {
    await c.env.DB.prepare(`UPDATE chat_visit SET expires_at = MAX(expires_at, ?1), updated_at = ?2
      WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5 AND closed = 0 AND expires_at > ?2`)
      .bind(now + 30000, now, id, contactID, owner).run();
  } else {
    // A leave arriving before an open is a tombstone, so late requests cannot reconnect it.
    await c.env.DB.prepare(`INSERT INTO chat_visit
      (id, contact_id, user_id, ready_at, expires_at, updated_at, closed)
      SELECT ?1, ?2, ?3, ?4, ?4, ?4, 1 WHERE EXISTS (SELECT 1 FROM contact WHERE id = ?2 AND user_id = ?3)
      ON CONFLICT(id) DO UPDATE SET closed = 1,
        expires_at = CASE WHEN chat_visit.connected = 0 THEN MIN(chat_visit.expires_at, ?4) ELSE chat_visit.expires_at END
      WHERE chat_visit.contact_id = ?2 AND chat_visit.user_id = ?3`)
      .bind(id, contactID, owner, now).run();
  }
  const visit = await c.env.DB.prepare(`SELECT connected, closed, expires_at AS expiresAt FROM chat_visit
    WHERE id = ?1 AND contact_id = ?2 AND user_id = ?3`)
    .bind(id, contactID, owner).first<{ connected: number; closed: number; expiresAt: number }>();
  const active = !!visit && !visit.closed && visit.expiresAt > now;
  if (body.kind === 'open' && active && !visit.connected) {
    try { await dispatchVisit(c.env, { kind: 'visit', visitID: id, contactID, userID: owner }); }
    catch {
      console.error(JSON.stringify({ event: 'visit_dispatch_deferred' }));
      return c.json({ error: 'Presence is temporarily unavailable' }, 503);
    }
  }
  return c.json({ active });
});
chats.get('/turns', async (c) => {
  const presence = await readPresence(c.env.DB, c.get('contactID'), c.get('owner'));
  const before = c.req.query('before');
  if (before !== undefined && (!/^\d{1,16}$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1)) {
    return c.json({ error: 'Invalid cursor' }, 400);
  }
  const { results } = await c.env.DB.prepare(`SELECT ${turnColumns} FROM chat_turn
    WHERE contact_id = ?1 AND user_id = ?2 AND sequence < ?3 ORDER BY sequence DESC LIMIT 51`)
    .bind(c.get('contactID'), c.get('owner'), before ? Number(before) : Number.MAX_SAFE_INTEGER).all<ChatTurn>();
  const page = results.slice(0, 50);
  return c.json({ presence, turns: page.reverse(), nextBefore: results.length > 50 ? page[0].sequence : null });
});
// Acknowledge only completed replies actually presented by the client. Never move backwards.
chats.put('/read', bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).join(',') !== 'sequence'
      || typeof body.sequence !== 'number' || !Number.isSafeInteger(body.sequence) || body.sequence < 1) {
    return c.json({ error: 'Provide the last displayed reply sequence' }, 400);
  }
  const state = await c.env.DB.prepare(`UPDATE contact SET last_read_sequence = MAX(last_read_sequence,
    COALESCE((SELECT MAX(sequence) FROM chat_turn WHERE contact_id = ?1 AND user_id = ?2
      AND status = 'complete' AND sequence <= ?3), 0))
    WHERE id = ?1 AND user_id = ?2 RETURNING last_read_sequence AS lastReadSequence`)
    .bind(c.get('contactID'), c.get('owner'), body.sequence).first<{ lastReadSequence: number }>();
  if (!state) return c.json({ error: 'Contact not found' }, 404);
  await c.env.DB.prepare(`DELETE FROM push_delivery WHERE turn_id IN
    (SELECT id FROM chat_turn WHERE contact_id = ? AND user_id = ? AND sequence <= ?)`)
    .bind(c.get('contactID'), c.get('owner'), state.lastReadSequence).run();
  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM chat_turn WHERE contact_id = ?
    AND user_id = ? AND status = 'complete' AND sequence > ?`)
    .bind(c.get('contactID'), c.get('owner'), state.lastReadSequence).first<{ count: number }>();
  return c.json({ ...state, unreadCount: unread?.count ?? 0,
    totalUnreadCount: await totalUnreadReplies(c.env.DB, c.get('owner')) });
});
chats.post('/turns', messageBody, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'id,text'
    || typeof body.id !== 'string' || !uuid.test(body.id) || typeof body.text !== 'string'
    || !body.text.trim() || Array.from(body.text.trim()).length > 4000 || body.text.includes('\0')) {
    return c.json({ error: 'Provide an id and a message using 1–4000 characters' }, 400);
  }
  const id = body.id.toLowerCase();
  const text = body.text.trim();
  const existing = await findTurn(c.env.DB, id, c.get('contactID'), c.get('owner'));
  if (existing) {
    if (existing.userText !== text) return c.json({ error: 'Message id already used' }, 409);
    if (existing.status === 'queued') c.executionCtx.waitUntil(dispatchChat(c.env, existing));
    return c.json({ turn: publicTurn(existing), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 200);
  }
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Replies are unavailable' }, 503);
  const limit = await admitAuthRequest(c.env.DB, c.get('owner'), 'chat-generation', 20);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json({ error: 'Too many messages' }, 429);
  }
  const now = Date.now();
  const turn = await c.env.DB.prepare(`INSERT INTO chat_turn
    (id, contact_id, user_id, user_text, status, workflow_id, created_at, updated_at)
    SELECT ?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?6
    WHERE EXISTS (SELECT 1 FROM contact WHERE id = ?2 AND user_id = ?3)
      AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = ?2 AND status IN ('queued','running'))
      AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = ?3 AND status IN ('queued','running')) < 10
    ON CONFLICT(id) DO NOTHING RETURNING ${storedColumns}`)
    .bind(id, c.get('contactID'), c.get('owner'), text, `chat-${id}-a1`, now).first<StoredTurn>();
  if (!turn) {
    const duplicate = await findTurn(c.env.DB, id, c.get('contactID'), c.get('owner'));
    if (duplicate?.userText === text) return c.json({ turn: publicTurn(duplicate), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) });
    return c.json({ error: 'A reply is already in progress or the conversation changed' }, 409);
  }
  c.executionCtx.waitUntil(dispatchChat(c.env, turn));
  return c.json({ turn: publicTurn(turn), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 202);
});
chats.post('/turns/:turnID/retry', messageBody, async (c) => {
  const previous = await findTurn(c.env.DB, c.req.param('turnID'), c.get('contactID'), c.get('owner'));
  if (!previous) return c.json({ error: 'Message not found' }, 404);
  if (previous.status !== 'failed') return c.json({ turn: publicTurn(previous), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) });
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Replies are unavailable' }, 503);
  const limit = await admitAuthRequest(c.env.DB, c.get('owner'), 'chat-generation', 20);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json({ error: 'Too many messages' }, 429);
  }
  const turn = await c.env.DB.prepare(`UPDATE chat_turn SET status = 'queued', attempt = attempt + 1,
    workflow_id = ?1, error_code = NULL, assistant_text = NULL, updated_at = ?2, checked_at = 0
    WHERE id = ?3 AND user_id = ?4 AND contact_id = ?5 AND status = 'failed' AND attempt = ?6
    AND sequence = (SELECT MAX(sequence) FROM chat_turn WHERE contact_id = ?5 AND user_id = ?4)
    AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = ?5 AND status IN ('queued','running'))
    AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = ?4 AND status IN ('queued','running')) < 10
    RETURNING ${storedColumns}`)
    .bind(`chat-${previous.id}-a${previous.attempt + 1}`, Date.now(), previous.id, c.get('owner'), c.get('contactID'), previous.attempt)
    .first<StoredTurn>();
  if (!turn) return c.json({ error: 'Conversation changed. Refresh before retrying' }, 409);
  c.executionCtx.waitUntil(dispatchChat(c.env, turn));
  return c.json({ turn: publicTurn(turn), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 202);
});
chats.post('/transcriptions', bodyLimit({ maxSize: 2 * 1024 * 1024,
  onError: (c) => c.json({ error: 'Recording is too large' }, 413) }), async (c) => {
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'audio/wav') {
    return c.json({ error: 'Send a WAV recording' }, 415);
  }
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Transcription is unavailable' }, 503);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'voice-transcription', 6);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many recordings' }, 429);
  }
  const audio = normalizedRecording(await c.req.arrayBuffer());
  if (!audio) return c.json({ error: 'Use a mono 16-bit 16 kHz WAV lasting 0.25–60 seconds' }, 400);
  try {
    const text = await transcribeRecording(c.env.META_API_KEY, audio);
    // Deletion during inference must not return text to a removed conversation.
    if (!await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?')
      .bind(c.get('contactID'), c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
    return c.json({ text });
  } catch (error) {
    if (error instanceof TranscriptionFailure) {
      if (error.code === 'NO_SPEECH' || error.code === 'TOO_LONG') return c.json({ code: error.code, error: 'Record a shorter message with clear speech' }, 422);
      if (error.code === 'REJECTED') return c.json({ error: 'Transcription is unavailable' }, 503);
    }
    console.error(JSON.stringify({ event: 'transcription_failed' }));
    return c.json({ error: 'Transcription could not be completed' }, 502);
  }
});
export default chats;
