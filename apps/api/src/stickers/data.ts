import { Buffer } from 'node:buffer';
import * as UPNG from 'upng-js';
import type { Attachment } from '../chat/attachments';
import { registerChatObject } from '../chat/object-storage';
import { removePhoto } from '../photos/storage';

// Sticker libraries (docs/stickers.md). A sticker is a transparent PNG of at most 512 pixels
// and 300 KB plus one emoji describing when to use it. A person's library and a contact's
// share the `sticker` table; bytes live in the private CONTACT_PHOTOS bucket.

export const maxStickerBytes = 300 * 1024;
export const maxUserStickers = 120;
export const maxAvatarStickers = 12;
export const maxSavedStickers = 30;
export type StickerOwner = { kind: 'user' | 'agent'; id: string };
export type StickerRow = { id: string; emoji: string; size: number; digest: string; width: number; height: number; source: 'upload' | 'avatar' | 'saved';
  objectKey: string; createdAt: number; ownerKind: 'user' | 'agent'; ownerID: string; scopeUserID: string | null };
export type PublicSticker = { id: string; emoji: string; width: number; height: number; size: number; source: StickerRow['source']; digest: string; createdAt: number };
export const stickerColumns = `id, emoji, size, digest, width, height, source, object_key AS objectKey, created_at AS createdAt,
  owner_kind AS ownerKind, owner_id AS ownerID, scope_user_id AS scopeUserID`;
export const publicSticker = (row: StickerRow): PublicSticker => ({ id: row.id, emoji: row.emoji, width: row.width, height: row.height,
  size: row.size, source: row.source, digest: row.digest, createdAt: row.createdAt });

// One emoji: a single grapheme that is a pictograph, flag or keycap.
const emojiShape = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;
export function validStickerEmoji(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 32) return false;
  const graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)];
  return graphemes.length === 1 && emojiShape.test(value);
}

// Reads the PNG only as far as needed: 8-bit-or-less palette/RGBA images up to 512 pixels with
// real transparency, because a sticker without a transparent background is just a picture.
export function parseStickerPng(bytes: Uint8Array): { width: number; height: number; digestInput: Uint8Array } | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 40 || bytes.length > maxStickerBytes || signature.some((byte, index) => bytes[index] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width < 16 || height < 16 || width > 512 || height > 512) return null;
  try {
    const image = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const rgba = new Uint8Array(UPNG.toRGBA8(image)[0]!);
    let clear = 0, solid = 0;
    for (let i = 3; i < rgba.length; i += 4) { if (rgba[i]! < 16) clear++; else if (rgba[i]! > 200) solid++; }
    const pixels = width * height;
    // A usable sticker has a visible subject and a transparent surround (at least 2% each).
    if (clear < pixels * 0.02 || solid < pixels * 0.02) return null;
  } catch { return null; }
  return { width, height, digestInput: bytes };
}

export const sha256 = async (bytes: Uint8Array) => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');

// users/<user>/stickers/ and contacts/<owner>/<agent>/stickers/ are covered by the account and
// agent cleanup prefix sweeps (migration 0091).
export async function stickerKey(env: Env, owner: StickerOwner, id: string): Promise<string | null> {
  if (owner.kind === 'user') return `users/${owner.id}/stickers/${id}.png`;
  const agent = await env.DB.prepare('SELECT owner_id AS ownerID FROM contact_agent WHERE id = ?').bind(owner.id).first<{ ownerID: string }>();
  return agent ? `contacts/${agent.ownerID}/${owner.id}/stickers/${id}.png` : null;
}

export async function countStickers(db: D1Database, owner: StickerOwner, scopeUserID: string | null | 'avatar'): Promise<number> {
  const row = scopeUserID === 'avatar'
    ? await db.prepare(`SELECT COUNT(*) AS count FROM sticker WHERE owner_kind = ?1 AND owner_id = ?2 AND source = 'avatar'`).bind(owner.kind, owner.id).first<{ count: number }>()
    : await db.prepare(`SELECT COUNT(*) AS count FROM sticker WHERE owner_kind = ?1 AND owner_id = ?2 AND source != 'avatar'
        AND (?3 IS NULL OR scope_user_id = ?3)`).bind(owner.kind, owner.id, scopeUserID).first<{ count: number }>();
  return row?.count ?? 0;
}

// Writes the object first, then the row; a failed insert removes the object again.
export async function addSticker(env: Env, input: { owner: StickerOwner; emoji: string; png: Uint8Array; width: number; height: number;
  source: StickerRow['source']; scopeUserID?: string | null; photoVersion?: string | null; limit?: { max: number; scope: string | null | 'avatar' } }): Promise<StickerRow | null> {
  const id = crypto.randomUUID();
  const key = await stickerKey(env, input.owner, id);
  if (!key) return null;
  const digest = await sha256(input.png);
  await env.CONTACT_PHOTOS.put(key, input.png, { httpMetadata: { contentType: 'image/png' } });
  const now = Date.now();
  // The limit is checked inside the same statement that inserts, so concurrent saves cannot exceed it.
  const limit = input.limit ? (input.limit.scope === 'avatar'
    ? `AND (SELECT COUNT(*) FROM sticker WHERE owner_kind = ?1 AND owner_id = ?2 AND source = 'avatar') < ?13`
    : `AND (SELECT COUNT(*) FROM sticker WHERE owner_kind = ?1 AND owner_id = ?2 AND source != 'avatar' AND (?14 IS NULL OR scope_user_id = ?14)) < ?13`) : '';
  const row = await env.DB.prepare(`INSERT INTO sticker (id, owner_kind, owner_id, scope_user_id, emoji, object_key, digest, size, width, height, source, source_photo_version, created_at)
    SELECT ?3, ?1, ?2, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?15 WHERE 1 = 1 ${limit}
    RETURNING ${stickerColumns}`)
    .bind(input.owner.kind, input.owner.id, id, input.scopeUserID ?? null, input.emoji, key, digest, input.png.length, input.width, input.height,
      input.source, input.photoVersion ?? null, input.limit?.max ?? 0, input.limit && input.limit.scope !== 'avatar' ? input.limit.scope : null, now)
    .first<StickerRow>().catch(() => null);
  if (!row) { await env.CONTACT_PHOTOS.delete(key); return null; }
  return row;
}

export async function removeSticker(env: Env, row: Pick<StickerRow, 'id' | 'objectKey'>): Promise<void> {
  await env.DB.prepare('DELETE FROM sticker WHERE id = ?').bind(row.id).run();
  // Chat history holds its own copies, so the library object is never shared.
  await removePhoto(env, row.objectKey);
}

export async function readStickerBytes(env: Env, row: Pick<StickerRow, 'objectKey' | 'size'>): Promise<Uint8Array | null> {
  const object = await env.CONTACT_PHOTOS.get(row.objectKey);
  if (!object || object.size !== row.size) return null;
  return new Uint8Array(await object.arrayBuffer());
}

// A message attachment that carries a sticker. The bytes are copied so history never depends
// on the library (deleting a sticker keeps old messages; clearing a chat keeps the library).
export type StickerAttachment = Attachment & { sticker: { id: string; emoji: string } };
export async function copyToMessage(env: Env, row: StickerRow, messageKey: string, scope: string): Promise<StickerAttachment | null> {
  const bytes = await readStickerBytes(env, row);
  if (!bytes) return null;
  await registerChatObject(env, messageKey, scope);
  await env.CONTACT_PHOTOS.put(messageKey, bytes, { httpMetadata: { contentType: 'image/png' } });
  return { name: 'Sticker.png', mimeType: 'image/png', size: bytes.length, digest: row.digest, key: messageKey, sticker: { id: row.id, emoji: row.emoji } };
}
export const isSticker = (attachment: Pick<Attachment, 'mimeType'> & { sticker?: unknown } | null | undefined): attachment is StickerAttachment =>
  !!attachment && typeof attachment === 'object' && 'sticker' in attachment && !!attachment.sticker;

// Stickers a contact may use in a person's conversation: its own avatar stickers (agent-wide)
// and the ones it saved from this person (scoped to them).
export async function agentLibrary(db: D1Database, agentID: string, userID: string): Promise<StickerRow[]> {
  const { results } = await db.prepare(`SELECT ${stickerColumns} FROM sticker WHERE owner_kind = 'agent' AND owner_id = ?1
    AND (scope_user_id IS NULL OR scope_user_id = ?2) ORDER BY created_at DESC LIMIT 60`).bind(agentID, userID).all<StickerRow>();
  return results;
}
export async function userLibrary(db: D1Database, userID: string): Promise<StickerRow[]> {
  const { results } = await db.prepare(`SELECT ${stickerColumns} FROM sticker WHERE owner_kind = 'user' AND owner_id = ?1
    ORDER BY created_at DESC LIMIT ?2`).bind(userID, maxUserStickers).all<StickerRow>();
  return results;
}

// A contact's own stickers are cut from its profile photo, so a new or removed photo retires them
// (and the face check) the way references to a replaced avatar are retired for generated images.
export async function dropAvatarStickers(env: Env, agentID: string): Promise<void> {
  const { results } = await env.DB.prepare(`DELETE FROM sticker WHERE owner_kind = 'agent' AND owner_id = ? AND source = 'avatar' RETURNING object_key AS key`)
    .bind(agentID).all<{ key: string }>();
  await env.DB.prepare('DELETE FROM sticker_photo_check WHERE agent_id = ?').bind(agentID).run();
  for (const { key } of results) await removePhoto(env, key);
}
