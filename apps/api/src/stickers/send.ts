import type { Buffer } from 'node:buffer';
import { stickerColumns, readStickerBytes, type StickerRow } from './data';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type SendableSticker = { metadata: { name: string; mimeType: string; size: number; digest: string }; bytes: Buffer; sticker: { id: string; emoji: string } };

// Resolves `{ id }` from a send request to one of the signed-in person's library stickers.
// The bytes are copied into the message by the caller, so the message never depends on the library.
export async function libraryStickerToSend(env: Env, userID: string, value: unknown): Promise<SendableSticker | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join(',') !== 'id') return null;
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string' || !uuid.test(id)) return null;
  const row = await env.DB.prepare(`SELECT ${stickerColumns} FROM sticker WHERE id = ? AND owner_kind = 'user' AND owner_id = ?`)
    .bind(id.toLowerCase(), userID).first<StickerRow>();
  const bytes = row && await readStickerBytes(env, row);
  if (!row || !bytes) return null;
  return { metadata: { name: 'Sticker.png', mimeType: 'image/png', size: bytes.length, digest: row.digest }, bytes: bytes as unknown as Buffer, sticker: { id: row.id, emoji: row.emoji } };
}
