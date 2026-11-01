import { remoteContext, remoteTargets } from '../native/remote';
import { parseNativeContext } from '../native/actions';
import { reactionRoutes } from '../reactions/routes';
import { parsePrivateReply, privateQuotes, privateTarget } from '../replies/data';
import { albumAttachments, albumIndex, mediaPage, parseAttachment, sameAttachment, storedAttachment, type Attachment } from '../chat/attachments';
import { contactModelAllowed } from '../chat/consent';
import { validTimeZone } from '../schedules/data';
import { lingerInChat, readPresence } from '../chat/presence';
import { totalUnreadReplies } from '../lib/unread';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { findTurn, publicTurn, storedColumns, turnColumns, type ChatTurn, type StoredTurn } from '../chat/data';
import { normalizedRecording, transcribeRecording, TranscriptionFailure } from '../chat/transcription';
import { dispatchChat } from '../chat/dispatch';
import { registerChatObject, discardChatObject } from '../chat/object-storage';
import { isVoice, parseVoice } from '../voice/speech';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { libraryStickerToSend } from '../stickers/send';
import { parsePostReference, publicPostReference, referencedPost, referencedPosts } from '../home/references';

const chats = new Hono<{ Bindings: Env; Variables: { owner: string; contactID: string } }>();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const attachmentBody = bodyLimit({ maxSize: 7 * 1024 * 1024 + 32768, onError: (c) => c.json({ error: 'Attachment must be 5 MB or smaller' }, 413) });
const messageBody = bodyLimit({ maxSize: 32768, onError: (c) => c.json({ error: 'Request body too large' }, 413) });
async function quotedTurn(db: D1Database, turn: StoredTurn) {
  const [quotes, posts] = await Promise.all([privateQuotes(db, turn.contactID, turn.userID, [turn]), referencedPosts(db, turn.userID, [turn])]);
  return { ...publicTurn(turn, quotes(turn), quotes), homePost: publicPostReference(turn, posts) };
}
const sameReply = (turn: StoredTurn, reply: { messageID: string; side: string } | undefined, postID: string | undefined) =>
  turn.replyToID === (reply?.messageID ?? null) && turn.replyToSide === (reply?.side ?? null) && (turn.homePostID ?? null) === (postID ?? null);
chats.use('*', async (c, next) => {
  const id = c.req.param('id');
  if (!id || !await c.env.DB.prepare('SELECT id FROM contact WHERE id = ? AND user_id = ?')
    .bind(id, c.get('owner')).first()) return c.json({ error: 'Contact not found' }, 404);
  c.set('contactID', id);
  if (c.req.method !== 'GET' && await c.env.DB.prepare('SELECT id FROM contact WHERE id=? AND clearing=1').bind(id).first()) {
    return c.json({error:'Chat cleanup is in progress. Please try again shortly.'},409);
  }
  if (c.req.method === 'POST' && !c.req.path.endsWith('/activity')
    && !await contactModelAllowed(c.env, id, c.get('owner'))) {
    return c.json({ error: 'Accept a new invitation with Contributor model consent before using this contact' }, 403);
  }
  await next();
});
chats.route('/reactions', reactionRoutes(false));
// Activity contains no draft text. Each foreground visit has a client UUID.
// Visits only pace replies and follow-ups; they never connect the contact.
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
    await c.env.DB.prepare(`UPDATE chat_visit SET expires_at = MAX(expires_at, ?1), updated_at = ?2, typing_at = ?2
      WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5 AND closed = 0 AND expires_at > ?2`)
      .bind(now + 30000, now, id, contactID, owner).run();
  } else {
    // A leave arriving before an open is a tombstone, so late requests cannot reconnect it.
    await c.env.DB.prepare(`INSERT INTO chat_visit
      (id, contact_id, user_id, ready_at, expires_at, updated_at, closed)
      SELECT ?1, ?2, ?3, ?4, ?4, ?4, 1 WHERE EXISTS (SELECT 1 FROM contact WHERE id = ?2 AND user_id = ?3)
      ON CONFLICT(id) DO UPDATE SET closed = 1, typing_at = NULL,
        expires_at = MIN(chat_visit.expires_at, ?4)
      WHERE chat_visit.contact_id = ?2 AND chat_visit.user_id = ?3`)
      .bind(id, contactID, owner, now).run();
  }
  const visit = await c.env.DB.prepare(`SELECT closed, expires_at AS expiresAt FROM chat_visit
    WHERE id = ?1 AND contact_id = ?2 AND user_id = ?3`)
    .bind(id, contactID, owner).first<{ closed: number; expiresAt: number }>();
  return c.json({ active: !!visit && !visit.closed && visit.expiresAt > now });
});
chats.get('/turns', async (c) => {
  const epoch = await c.env.DB.prepare('SELECT history_revision AS value FROM contact WHERE id=?').bind(c.get('contactID')).first<{value:number}>();
  const before = c.req.query('before');
  // Only the visible chat polls its latest page; that poll keeps an open visit
  // and an ongoing conversation's contact online (chat/presence.ts).
  if (before === undefined) await c.env.DB.batch(lingerInChat(c.env.DB, c.get('contactID'), c.get('owner')));
  const presence = await readPresence(c.env.DB, c.get('contactID'), c.get('owner'));
  if (before !== undefined && (!/^\d{1,16}$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1)) {
    return c.json({ error: 'Invalid cursor' }, 400);
  }
  // Task work turns carry the task title so clients can say what the contact is working on.
  const { results } = await c.env.DB.prepare(`SELECT ${turnColumns}, attachment_json AS attachmentJSON,
    (SELECT title FROM task WHERE task.id = chat_turn.task_id) AS taskTitle FROM chat_turn
    WHERE contact_id = ?1 AND user_id = ?2 AND sequence < ?3 ORDER BY sequence DESC LIMIT 51`)
    .bind(c.get('contactID'), c.get('owner'), before ? Number(before) : Number.MAX_SAFE_INTEGER).all<ChatTurn & { attachmentJSON: string | null; taskTitle: string | null }>();
  const page = results.slice(0, 50);
  const [quotes, posts] = await Promise.all([privateQuotes(c.env.DB, c.get('contactID'), c.get('owner'), page), referencedPosts(c.env.DB, c.get('owner'), page)]);
  const revision = await c.env.DB.prepare('SELECT history_revision AS value FROM contact WHERE id=?').bind(c.get('contactID')).first<{value:number}>();
  if (!epoch || revision?.value!==epoch.value) return c.json({error:'Chat was cleared. Refresh history.'},409);
  return c.json({ historyRevision: epoch.value, presence, turns: page.reverse().map((turn) => ({ ...publicTurn(turn, quotes(turn), quotes), homePost: publicPostReference(turn, posts), taskTitle: turn.taskTitle })), nextBefore: results.length > 50 ? page[0].sequence : null });
});
// Acknowledge only completed replies actually presented by the client. Never move backwards.
chats.put('/read', bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).join(',') !== 'sequence'
      || typeof body.sequence !== 'number' || !Number.isSafeInteger(body.sequence) || body.sequence < 1) {
    return c.json({ error: 'Provide the last displayed reply sequence' }, 400);
  }
  const state = await c.env.DB.prepare(`UPDATE contact SET last_reply_read_at = CASE WHEN EXISTS (
      SELECT 1 FROM chat_turn WHERE contact_id = ?1 AND user_id = ?2 AND status = 'complete'
        AND assistant_text IS NOT NULL AND sequence > last_read_sequence AND sequence <= ?3
    ) THEN ?4 ELSE last_reply_read_at END, last_read_sequence = MAX(last_read_sequence,
    COALESCE((SELECT MAX(sequence) FROM chat_turn WHERE contact_id = ?1 AND user_id = ?2
      AND status = 'complete' AND assistant_text IS NOT NULL AND sequence <= ?3), 0))
    WHERE id = ?1 AND user_id = ?2 RETURNING last_read_sequence AS lastReadSequence`)
    .bind(c.get('contactID'), c.get('owner'), body.sequence, Date.now()).first<{ lastReadSequence: number }>();
  if (!state) return c.json({ error: 'Contact not found' }, 404);
  await c.env.DB.prepare(`DELETE FROM push_delivery WHERE turn_id IN
    (SELECT id FROM chat_turn WHERE contact_id = ? AND user_id = ? AND sequence <= ?)`)
    .bind(c.get('contactID'), c.get('owner'), state.lastReadSequence).run();
  const unread = await c.env.DB.prepare(`SELECT COUNT(*) AS count FROM chat_turn WHERE contact_id = ?
    AND user_id = ? AND status = 'complete' AND assistant_text IS NOT NULL AND sequence > ?`)
    .bind(c.get('contactID'), c.get('owner'), state.lastReadSequence).first<{ count: number }>();
  return c.json({ ...state, unreadCount: unread?.count ?? 0,
    totalUnreadCount: await totalUnreadReplies(c.env.DB, c.get('owner')) });
});
chats.post('/turns', attachmentBody, async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['id', 'text', 'timeZone', 'attachment', 'sticker', 'voice', 'replyTo', 'homePost', 'nativeContext', 'remoteDeviceID', 'historyRevision'].includes(key))
    || (body.timeZone !== undefined && !validTimeZone(body.timeZone))
    || typeof body.id !== 'string' || !uuid.test(body.id) || typeof body.text !== 'string'
    || (!body.text.trim() && body.attachment === undefined && body.voice === undefined && body.sticker === undefined) || Array.from(body.text.trim()).length > 4000 || body.text.includes('\0')) {
    return c.json({ error: 'Provide an id and a message using 1–4000 characters' }, 400);
  }
  const epoch = await c.env.DB.prepare('SELECT history_revision AS revision,clearing,setup_pending AS setupPending FROM contact WHERE id=? AND user_id=?')
    .bind(c.get('contactID'),c.get('owner')).first<{revision:number;clearing:number;setupPending:number}>();
  if (epoch?.setupPending) return c.json({ error: 'This contact is still being created. Try again in a moment.' }, 409);
  if (!epoch || epoch.clearing || (body.historyRevision ?? 0)!==epoch.revision) return c.json({error:'Chat was cleared. Refresh before sending a new message.'},409);
  // A voice message is only audio: no caption or file. Its transcript comes later.
  if (body.voice !== undefined && (body.text.trim() || body.attachment !== undefined || body.sticker !== undefined)) {
    return c.json({ error: 'Send a voice message without text or attachments' }, 400);
  }
  // A sticker is sent alone, by library ID (docs/stickers.md#sending).
  if (body.sticker !== undefined && (body.text.trim() || body.attachment !== undefined)) {
    return c.json({ error: 'Send a sticker without text or attachments' }, 400);
  }
  if (body.remoteDeviceID !== undefined && (typeof body.remoteDeviceID !== 'string' || !uuid.test(body.remoteDeviceID) || body.nativeContext !== undefined)) return c.json({ error: 'Choose one native device' }, 400);
  const localNative = body.nativeContext === undefined ? null : parseNativeContext(body.nativeContext);
  if (body.nativeContext !== undefined && (!localNative || localNative.remote || localNative.remoteTargets || !localNative.deviceID)) return c.json({ error: 'Invalid native device capabilities' }, 400);
  // remoteDeviceID is the older explicit single-phone selection; current clients omit it and
  // the server lists every phone this participant may use for the model to choose from.
  const targets = typeof body.remoteDeviceID === 'string' ? [] : await remoteTargets(c.env.DB, c.get('owner'), c.get('contactID'), localNative?.deviceID ?? null);
  const native = typeof body.remoteDeviceID === 'string'
    ? await remoteContext(c.env.DB, c.get('owner'), c.get('contactID'), body.remoteDeviceID.toLowerCase())
    : targets.length ? { ...(localNative ?? { kinds: [] }), remoteTargets: targets } : localNative;
  if (body.remoteDeviceID !== undefined && !native) return c.json({ error: 'Remote device unavailable or permission revoked' }, 403);
  const nativeJSON = native ? JSON.stringify(native) : null;
  const reply = parsePrivateReply(body.replyTo);
  if (reply === null) return c.json({ error: 'Choose a message from this conversation to reply to' }, 400);
  // A For you post this message answers (docs/updates.md#continue-in-chat).
  const postID = parsePostReference(body.homePost);
  if (postID === null) return c.json({ error: 'Choose a For you post to reply to' }, 400);
  const sticker = body.sticker === undefined ? null : await libraryStickerToSend(c.env, c.get('owner'), body.sticker);
  if (body.sticker !== undefined && !sticker) return c.json({ error: 'Choose a sticker from your library' }, 404);
  const attachment = sticker ? { metadata: sticker.metadata, bytes: sticker.bytes } : body.voice !== undefined ? await parseVoice(body.voice)
    : body.attachment === undefined ? null : await parseAttachment(body.attachment);
  if (body.voice !== undefined && !attachment) return c.json({ error: 'Use a mono 16-bit 16 kHz WAV lasting 0.25–60 seconds' }, 400);
  if (body.attachment !== undefined && !attachment) return c.json({ error: 'Choose a JPEG, PNG, GIF, WebP, or PDF up to 5 MB' }, 400);
  const id = body.id.toLowerCase();
  const text = body.text.trim();
  // A transcribed voice turn has text; the audio digest alone identifies the send.
  const sameText = (turn: StoredTurn) => turn.userText === text || (body.voice !== undefined && isVoice(storedAttachment(turn)));
  const existing = await findTurn(c.env.DB, id, c.get('contactID'), c.get('owner'));
  if (existing) {
    if (!sameText(existing) || !sameAttachment(existing, attachment?.metadata) || !sameReply(existing, reply, postID)) return c.json({ error: 'Message id already used' }, 409);
    if (existing.status === 'queued') c.executionCtx.waitUntil(dispatchChat(c.env, existing));
    return c.json({ turn: await quotedTurn(c.env.DB, existing), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 200);
  }
  // Only an existing message from this participant's own conversation can be quoted.
  const replyTarget = `(?9 IS NULL OR EXISTS (SELECT 1 FROM chat_turn quoted WHERE quoted.id = ?9
    AND quoted.contact_id = ?2 AND quoted.user_id = ?3 AND ${privateTarget('quoted', '?10')}))`;
  if (reply && !await c.env.DB.prepare(`SELECT 1 FROM chat_turn quoted WHERE quoted.id = ?1 AND quoted.contact_id = ?2
    AND quoted.user_id = ?3 AND ${privateTarget('quoted', '?4')}`).bind(reply.messageID, c.get('contactID'), c.get('owner'), reply.side).first()) {
    return c.json({ error: 'The message you are replying to is no longer available' }, 400);
  }
  const post = postID ? await referencedPost(c.env.DB, c.get('owner'), c.get('contactID'), postID) : null;
  if (post && 'error' in post) return c.json({ error: post.error }, 400);
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Replies are unavailable' }, 503);
  const limit = await admitAuthRequest(c.env.DB, c.get('owner'), 'chat-generation', 20);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json({ error: 'Too many messages' }, 429);
  }
  const now = Date.now();
  const key = attachment ? `attachments/${c.get('owner')}/${c.get('contactID')}/${id}/${crypto.randomUUID()}` : null;
  const attachmentJSON = attachment && key ? JSON.stringify({ ...attachment.metadata, key, ...(sticker ? { sticker: sticker.sticker } : {}) }) : null;
  if (attachment && key) {
    await registerChatObject(c.env,key,c.get('contactID'));
    await c.env.CONTACT_PHOTOS.put(key, attachment.bytes, { httpMetadata: { contentType: attachment.metadata.mimeType } });
  }
  const turn = await c.env.DB.prepare(`INSERT INTO chat_turn
    (id, contact_id, user_id, user_text, status, workflow_id, created_at, updated_at, time_zone, attachment_json, reply_to_id, reply_to_side, native_context_json, home_post_id, home_post_json)
    SELECT ?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?6, ?7, ?8, ?9, ?10, ?11, ?13, ?14
    WHERE EXISTS (SELECT 1 FROM contact WHERE id = ?2 AND user_id = ?3 AND history_revision=?12 AND clearing=0) AND ${replyTarget}
      AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = ?3 AND status IN ('queued','running')) < 10
    ON CONFLICT(id) DO NOTHING RETURNING ${storedColumns}`)
    .bind(id, c.get('contactID'), c.get('owner'), text, `chat-${id}-a1`, now, body.timeZone ?? null, attachmentJSON,
      reply?.messageID ?? null, reply?.side ?? null, nativeJSON,epoch.revision, postID ?? null, post?.json ?? null).first<StoredTurn>();
  if (!turn) {
    if (key) await discardChatObject(c.env,key,c.get('contactID'));
    const duplicate = await findTurn(c.env.DB, id, c.get('contactID'), c.get('owner'));
    if (duplicate && sameText(duplicate) && sameAttachment(duplicate, attachment?.metadata) && sameReply(duplicate, reply, postID)) return c.json({ turn: await quotedTurn(c.env.DB, duplicate), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) });
    return c.json({ error: 'Too many pending messages or the conversation changed' }, 409);
  }
  await c.env.DB.prepare(`UPDATE chat_visit SET typing_at = NULL
    WHERE contact_id = ? AND user_id = ? AND typing_at <= ?`)
    .bind(c.get('contactID'), c.get('owner'), now).run();
  c.executionCtx.waitUntil(dispatchChat(c.env, turn));
  return c.json({ turn: await quotedTurn(c.env.DB, turn), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 202);
});
// Shared media for chat details: images or files from both sides, newest first.
// A page covers up to 30 messages with images (full-size bytes) or 60 with files; the cursor is the last sequence.
chats.get('/media', async (c) => {
  const kind = c.req.query('kind'), before = c.req.query('before');
  if ((kind !== 'image' && kind !== 'file') || (before !== undefined && (!/^\d{1,16}$/.test(before) || Number(before) < 1))) {
    return c.json({ error: 'Choose image or file media with a valid cursor' }, 400);
  }
  const { results } = await c.env.DB.prepare(`SELECT sequence, id, created_at AS createdAt,
    attachment_json AS attachmentJSON, assistant_messages_json AS assistantMessagesJSON FROM chat_turn
    WHERE contact_id = ?1 AND user_id = ?2 AND sequence < ?3 AND (
      (attachment_json IS NOT NULL AND json_extract(attachment_json, '$.mimeType') NOT LIKE 'audio/%'
        AND json_extract(attachment_json, '$.sticker') IS NULL
        AND (json_extract(attachment_json, '$.mimeType') LIKE 'image/%') = (?4 = 'image'))
      OR (json_extract(assistant_messages_json, '$[0].attachment.key') IS NOT NULL
        AND json_extract(assistant_messages_json, '$[0].attachment.sticker') IS NULL
        AND json_extract(assistant_messages_json, '$[0].attachment.mimeType') NOT LIKE 'audio/%'
        AND (json_extract(assistant_messages_json, '$[0].attachment.mimeType') LIKE 'image/%') = (?4 = 'image')))
    ORDER BY sequence DESC LIMIT ?5`)
    .bind(c.get('contactID'), c.get('owner'), before ? Number(before) : Number.MAX_SAFE_INTEGER, kind, mediaPage(kind) + 1)
    .all<{ sequence: number; id: string; createdAt: number; attachmentJSON: string | null; assistantMessagesJSON: string | null }>();
  const page = results.slice(0, mediaPage(kind));
  const items = page.flatMap((turn) => {
    const reply = (JSON.parse(turn.assistantMessagesJSON ?? '[]') as { createdAt: number; attachment?: Attachment | null; attachments?: Attachment[] | null }[])[0];
    // A contact-generated album lists each image in order; image addresses it.
    const album = reply ? albumAttachments(reply.attachment, reply.attachments) : [];
    return [
      ...album.map((attachment, image) => ({ side: 'assistant' as const, createdAt: reply!.createdAt, attachment, image: album.length > 1 ? image : undefined })),
      ...(turn.attachmentJSON ? [{ side: 'user' as const, createdAt: turn.createdAt, attachment: JSON.parse(turn.attachmentJSON) as Attachment, image: undefined }] : []),
    ].filter(({ attachment }) => !isVoice(attachment) && !attachment.sticker && attachment.mimeType.startsWith('image/') === (kind === 'image'))
      .map(({ side, createdAt, attachment, image }) => ({ messageID: turn.id, side, sequence: turn.sequence, createdAt,
        ...(image !== undefined ? { image } : {}), name: attachment.name, mimeType: attachment.mimeType, size: attachment.size }));
  });
  return c.json({ items, nextBefore: results.length > page.length ? page[page.length - 1].sequence : null });
});
chats.put('/turns/:turnID/attachment/listened', async (c) => {
  const part = Number(c.req.query('part') ?? '0');
  if (c.req.query('side') !== 'assistant' || !Number.isSafeInteger(part) || part < 0 || part > 7) {
    return c.json({ error: 'Voice message not found' }, 404);
  }
  const path = `$."${part}"`;
  const row = await c.env.DB.prepare(`UPDATE chat_turn
    SET assistant_voice_listened_json = json_set(assistant_voice_listened_json, ?1,
      COALESCE(json_extract(assistant_voice_listened_json, ?1), ?2))
    WHERE id = ?3 AND contact_id = ?4 AND user_id = ?5
      AND json_extract(assistant_messages_json, ?6) LIKE 'audio/%'
      AND EXISTS (SELECT 1 FROM contact WHERE id = ?4 AND user_id = ?5 AND clearing = 0)
    RETURNING json_extract(assistant_voice_listened_json, ?1) AS listenedAt`)
    .bind(path, Date.now(), c.req.param('turnID'), c.get('contactID'), c.get('owner'), `$[${part}].attachment.mimeType`)
    .first<{ listenedAt: number }>();
  return row ? c.json(row) : c.json({ error: 'Voice message not found' }, 404);
});
chats.get('/turns/:turnID/attachment', async (c) => {
  const turn = await findTurn(c.env.DB, c.req.param('turnID'), c.get('contactID'), c.get('owner'));
  const part = Number(c.req.query('part') ?? '0');
  const image = albumIndex(c.req.query('image'));
  if (!Number.isSafeInteger(part) || part < 0 || part > 7 || image === null) return c.json({ error: 'Attachment not found' }, 404);
  const message = turn && c.req.query('side') === 'assistant'
    ? (JSON.parse(turn.assistantMessagesJSON ?? '[]') as { attachment?: Attachment; attachments?: Attachment[] }[])[part] : null;
  // image selects a contact-generated album image; human uploads remain single.
  const attachment = turn && (c.req.query('side') === 'assistant'
    ? message && albumAttachments(message.attachment, message.attachments)[image]
    : image === 0 ? storedAttachment(turn) : null);
  if (!attachment) return c.json({ error: 'Attachment not found' }, 404);
  const object = await c.env.CONTACT_PHOTOS.get(attachment.key);
  if (!object) return c.json({ error: 'Attachment not found' }, 404);
  return new Response(object.body, { headers: {
    'Content-Type': attachment.mimeType, 'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
});
chats.post('/turns/:turnID/retry', messageBody, async (c) => {
  const previous = await findTurn(c.env.DB, c.req.param('turnID'), c.get('contactID'), c.get('owner'));
  if (!previous) return c.json({ error: 'Message not found' }, 404);
  if (previous.errorCode === 'MESSAGE_BATCHED') return c.json({ error: 'This message is included in the next reply' }, 409);
  if (previous.scheduleID) return c.json({ error: 'Scheduled messages cannot be manually retried' }, 409);
  if (previous.groupRequestID) return c.json({ error: 'Automatic group results cannot be manually retried. Ask a new question instead.' }, 409);
  if (previous.taskID) return c.json({ error: 'Task updates cannot be manually retried. The contact reviews open tasks again later.' }, 409);
  if (previous.status !== 'failed') return c.json({ turn: await quotedTurn(c.env.DB, previous), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) });
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Replies are unavailable' }, 503);
  const limit = await admitAuthRequest(c.env.DB, c.get('owner'), 'chat-generation', 20);
  if (!limit.allowed) {
    c.header('Retry-After', String(limit.retryAfter));
    return c.json({ error: 'Too many messages' }, 429);
  }
  const turn = await c.env.DB.prepare(`UPDATE chat_turn SET status = 'queued', attempt = attempt + 1,
    workflow_id = ?1, error_code = NULL, assistant_text = NULL, assistant_messages_json = NULL, updated_at = ?2, checked_at = 0
    WHERE id = ?3 AND user_id = ?4 AND contact_id = ?5 AND status = 'failed' AND attempt = ?6
    AND sequence = (SELECT MAX(sequence) FROM chat_turn WHERE contact_id = ?5 AND user_id = ?4)
    AND NOT EXISTS (SELECT 1 FROM chat_turn WHERE contact_id = ?5 AND status IN ('queued','running'))
    AND (SELECT COUNT(*) FROM chat_turn WHERE user_id = ?4 AND status IN ('queued','running')) < 10
    RETURNING ${storedColumns}`)
    .bind(`chat-${previous.id}-a${previous.attempt + 1}`, Date.now(), previous.id, c.get('owner'), c.get('contactID'), previous.attempt)
    .first<StoredTurn>();
  if (!turn) return c.json({ error: 'Conversation changed. Refresh before retrying' }, 409);
  c.executionCtx.waitUntil(dispatchChat(c.env, turn));
  return c.json({ turn: await quotedTurn(c.env.DB, turn), presence: await readPresence(c.env.DB, c.get('contactID'), c.get('owner')) }, 202);
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
