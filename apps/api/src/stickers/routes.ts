import { Buffer } from 'node:buffer';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readBearerSession } from '../lib/session';
import { cutout, CutoutError } from './cutout';
import { accountModel } from '../lib/model-preference';
import { addSticker, agentLibrary, maxUserStickers, parseStickerPng, publicSticker, removeSticker, stickerColumns,
  userLibrary, validStickerEmoji, type StickerRow } from './data';
import { isRecord } from '../chat/meta';
import type { Attachment } from '../chat/attachments';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sourceBytes = 5 * 1024 * 1024;
const imageHeaders = (size: number) => ({ 'Content-Type': 'image/png', 'Content-Length': String(size), 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="sticker.png"' });

async function bodyBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

const stickers = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
stickers.use('*', async (c, next) => {
  const session = await readBearerSession(c.env, c.req.raw.headers);
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  c.set('owner', session.user.id);
  await next();
});

stickers.get('/', async (c) => c.json({ stickers: (await userLibrary(c.env.DB, c.get('owner'))).map(publicSticker), limit: maxUserStickers }));

// Cuts the subject out of an uploaded photo and returns the transparent PNG as a preview.
// Nothing is stored until POST /stickers; the result is a candidate the person confirms.
stickers.post('/cutout', bodyLimit({ maxSize: sourceBytes + 1024, onError: (c) => c.json({ error: 'Photo must be 5 MB or smaller' }, 413) }), async (c) => {
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase();
  if (type !== 'image/jpeg' && type !== 'image/png') return c.json({ error: 'Send a JPEG or PNG photo' }, 415);
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Sticker creation is unavailable' }, 503);
  const subject = c.req.query('subject')?.trim();
  if (subject !== undefined && !/^[\p{L}\p{N} -]{2,40}$/u.test(subject)) return c.json({ error: 'Describe the subject in 2–40 letters' }, 400);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'sticker-cutout', 6);
  if (!admission.allowed) {
    c.header('Retry-After', String(admission.retryAfter));
    return c.json({ error: 'Too many cutouts. Please wait a minute.' }, 429);
  }
  const bytes = await bodyBytes(c.req.raw, sourceBytes);
  if (!bytes) return c.json({ error: 'Photo must be 5 MB or smaller' }, 413);
  try {
    const result = await cutout(c.env, bytes, await accountModel(c.env, c.get('owner')), subject);
    return new Response(result.png, { headers: { ...imageHeaders(result.png.length), 'X-Sticker-Width': String(result.width), 'X-Sticker-Height': String(result.height) } });
  } catch (error) {
    if (error instanceof CutoutError) {
      if (error.code === 'UNSUPPORTED_IMAGE') return c.json({ error: 'Use a JPEG or PNG up to 2048 pixels on each side' }, 422);
      if (error.code === 'NO_SUBJECT') return c.json({ code: 'NO_SUBJECT', error: 'Could not find a subject to cut out. Try another photo or name what to cut out.' }, 422);
    }
    console.error(JSON.stringify({ event: 'sticker_cutout_failed' }));
    return c.json({ error: 'Sticker creation is unavailable right now' }, 502);
  }
});

// Saves a (previewed) transparent PNG with its emoji to the person's library.
stickers.post('/', bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'Sticker is too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'data,emoji' || typeof body.data !== 'string' || !validStickerEmoji(body.emoji)) {
    return c.json({ error: 'Provide one emoji and a transparent PNG sticker' }, 400);
  }
  const png = Buffer.from(body.data, 'base64');
  if (png.toString('base64') !== body.data) return c.json({ error: 'Provide one emoji and a transparent PNG sticker' }, 400);
  const parsed = parseStickerPng(png);
  if (!parsed) return c.json({ error: 'Stickers must be transparent PNGs up to 512 pixels and 300 KB' }, 422);
  const admission = await admitAuthRequest(c.env.DB, c.get('owner'), 'sticker-save', 30);
  if (!admission.allowed) { c.header('Retry-After', String(admission.retryAfter)); return c.json({ error: 'Too many stickers. Please wait a minute.' }, 429); }
  const row = await addSticker(c.env, { owner: { kind: 'user', id: c.get('owner') }, emoji: body.emoji, png, width: parsed.width, height: parsed.height,
    source: 'upload', limit: { max: maxUserStickers, scope: null } });
  return row ? c.json({ sticker: publicSticker(row) }, 201) : c.json({ error: `Your sticker library is full (${maxUserStickers}). Delete one first.` }, 409);
});

const ownSticker = (db: D1Database, id: string, owner: string) => uuid.test(id)
  ? db.prepare(`SELECT ${stickerColumns} FROM sticker WHERE id = ? AND owner_kind = 'user' AND owner_id = ?`).bind(id.toLowerCase(), owner).first<StickerRow>() : Promise.resolve(null);

stickers.patch('/:id', bodyLimit({ maxSize: 512, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || Object.keys(body).join(',') !== 'emoji' || !validStickerEmoji(body.emoji)) return c.json({ error: 'Provide one emoji' }, 400);
  const row = await ownSticker(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!row) return c.json({ error: 'Sticker not found' }, 404);
  await c.env.DB.prepare('UPDATE sticker SET emoji = ? WHERE id = ?').bind(body.emoji, row.id).run();
  return c.json({ sticker: publicSticker({ ...row, emoji: body.emoji }) });
});
stickers.delete('/:id', async (c) => {
  const row = await ownSticker(c.env.DB, c.req.param('id'), c.get('owner'));
  if (!row) return c.json({ error: 'Sticker not found' }, 404);
  await removeSticker(c.env, row);
  return c.json({ deleted: true });
});
stickers.get('/:id/image', async (c) => {
  const row = await ownSticker(c.env.DB, c.req.param('id'), c.get('owner'));
  const object = row && await c.env.CONTACT_PHOTOS.get(row.objectKey);
  return object ? new Response(object.body, { headers: imageHeaders(object.size) }) : c.json({ error: 'Sticker not found' }, 404);
});

// Saves a sticker a contact sent in the person's own chat ("Save sticker").
stickers.post('/save', bodyLimit({ maxSize: 1024, onError: (c) => c.json({ error: 'Request body too large' }, 413) }), async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const part = body?.part === undefined ? 0 : body.part;
  if (!body || !isRecord(body) || Object.keys(body).some(key => !['contactID', 'turnID', 'part'].includes(key)) || typeof body.contactID !== 'string'
    || typeof body.turnID !== 'string' || !uuid.test(body.turnID) || !Number.isInteger(part) || (part as number) < 0 || (part as number) > 7) {
    return c.json({ error: 'Choose a sticker message from one of your chats' }, 400);
  }
  const turn = await c.env.DB.prepare(`SELECT assistant_messages_json AS messages FROM chat_turn WHERE id = ?1 AND contact_id = ?2 AND user_id = ?3`)
    .bind(body.turnID.toLowerCase(), body.contactID, c.get('owner')).first<{ messages: string | null }>();
  const message = turn?.messages ? (JSON.parse(turn.messages) as { attachment?: Attachment & { sticker?: { id: string; emoji: string } } }[])[part as number] : null;
  const attachment = message?.attachment;
  if (!attachment?.sticker) return c.json({ error: 'That message has no sticker' }, 404);
  const object = await c.env.CONTACT_PHOTOS.get(attachment.key);
  if (!object || object.size !== attachment.size) return c.json({ error: 'That sticker is no longer available' }, 404);
  const png = new Uint8Array(await object.arrayBuffer());
  // Saving the same sticker twice returns the existing entry.
  const digest = attachment.digest;
  const existing = await c.env.DB.prepare(`SELECT ${stickerColumns} FROM sticker WHERE owner_kind = 'user' AND owner_id = ? AND digest = ?`)
    .bind(c.get('owner'), digest).first<StickerRow>();
  if (existing) return c.json({ sticker: publicSticker(existing) });
  const parsed = parseStickerPng(png);
  if (!parsed) return c.json({ error: 'That sticker cannot be saved' }, 422);
  const row = await addSticker(c.env, { owner: { kind: 'user', id: c.get('owner') }, emoji: attachment.sticker.emoji, png, width: parsed.width, height: parsed.height,
    source: 'saved', limit: { max: maxUserStickers, scope: null } });
  return row ? c.json({ sticker: publicSticker(row) }, 201) : c.json({ error: `Your sticker library is full (${maxUserStickers}). Delete one first.` }, 409);
});

export default stickers;

// A contact's stickers as the signed-in person may see them: its own avatar stickers and the
// ones it saved from this person. Mounted at /contacts/:id/stickers.
export const contactStickers = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
async function visibleAgent(db: D1Database, contactID: string, owner: string) {
  return db.prepare('SELECT agent_id AS agentID FROM contact WHERE id = ? AND user_id = ?').bind(contactID, owner).first<{ agentID: string }>();
}
contactStickers.get('/', async (c) => {
  const contact = await visibleAgent(c.env.DB, c.req.param('id')!, c.get('owner'));
  if (!contact) return c.json({ error: 'Contact not found' }, 404);
  return c.json({ stickers: (await agentLibrary(c.env.DB, contact.agentID, c.get('owner'))).map(publicSticker) });
});
contactStickers.get('/:stickerID/image', async (c) => {
  const contact = await visibleAgent(c.env.DB, c.req.param('id')!, c.get('owner'));
  const id = c.req.param('stickerID')!;
  const row = contact && uuid.test(id) ? (await agentLibrary(c.env.DB, contact.agentID, c.get('owner'))).find(item => item.id === id.toLowerCase()) : null;
  const object = row && await c.env.CONTACT_PHOTOS.get(row.objectKey);
  return object ? new Response(object.body, { headers: imageHeaders(object.size) }) : c.json({ error: 'Sticker not found' }, 404);
});
// Saves one of the contact's stickers to the person's library ("Save" in the contact tab).
contactStickers.post('/:stickerID/save', async (c) => {
  const contact = await visibleAgent(c.env.DB, c.req.param('id')!, c.get('owner'));
  const id = c.req.param('stickerID')!;
  const row = contact && uuid.test(id) ? (await agentLibrary(c.env.DB, contact.agentID, c.get('owner'))).find(item => item.id === id.toLowerCase()) : null;
  if (!row) return c.json({ error: 'Sticker not found' }, 404);
  const existing = await c.env.DB.prepare(`SELECT ${stickerColumns} FROM sticker WHERE owner_kind = 'user' AND owner_id = ? AND digest = ?`)
    .bind(c.get('owner'), row.digest).first<StickerRow>();
  if (existing) return c.json({ sticker: publicSticker(existing) });
  const object = await c.env.CONTACT_PHOTOS.get(row.objectKey);
  if (!object) return c.json({ error: 'Sticker not found' }, 404);
  const copy = await addSticker(c.env, { owner: { kind: 'user', id: c.get('owner') }, emoji: row.emoji, png: new Uint8Array(await object.arrayBuffer()),
    width: row.width, height: row.height, source: 'saved', limit: { max: maxUserStickers, scope: null } });
  return copy ? c.json({ sticker: publicSticker(copy) }, 201) : c.json({ error: `Your sticker library is full (${maxUserStickers}). Delete one first.` }, 409);
});
