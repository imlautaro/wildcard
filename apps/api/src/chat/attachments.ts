import { Buffer } from 'node:buffer';
import { isRecord, type ModelMessage } from './meta';
import type { StoredTurn } from './data';

export const attachmentLimit = 5 * 1024 * 1024;
// Chat details media pages: fewer messages for images, whose grid loads full-size bytes.
export const mediaPage = (kind: string) => kind === 'image' ? 30 : 60;
export type Attachment = { name: string; mimeType: string; size: number; digest: string; key: string; durationMs?: number };
export type PublicAttachment = Pick<Attachment, 'name' | 'mimeType' | 'size'>;

// Accept only the formats offered by the native picker; never fetch user URLs.
export async function parseAttachment(value: unknown): Promise<{ metadata: Omit<Attachment, 'key'>; bytes: Buffer } | null> {
  if (!isRecord(value) || Object.keys(value).some((key) => !['name', 'mimeType', 'data'].includes(key)) ||
    typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(value.name) ||
    typeof value.mimeType !== 'string' || typeof value.data !== 'string' ||
    value.data.length > Math.ceil(attachmentLimit / 3) * 4 || /[^A-Za-z0-9+/=]/.test(value.data)) return null;
  const bytes = Buffer.from(value.data, 'base64');
  if (!bytes.length || bytes.length > attachmentLimit || bytes.toString('base64') !== value.data) return null;
  const head = bytes.subarray(0, 12);
  const valid = value.mimeType === 'application/pdf' ? head.subarray(0, 5).toString() === '%PDF-'
    : value.mimeType === 'image/jpeg' ? head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    : value.mimeType === 'image/png' ? head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : value.mimeType === 'image/gif' ? ['GIF87a', 'GIF89a'].includes(head.subarray(0, 6).toString())
    : value.mimeType === 'image/webp' ? head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP'
    : false;
  if (!valid) return null;
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  return { metadata: { name: value.name, mimeType: value.mimeType, size: bytes.length, digest }, bytes };
}

export function storedAttachment(turn: Pick<StoredTurn, 'attachmentJSON'>): Attachment | null {
  return turn.attachmentJSON ? JSON.parse(turn.attachmentJSON) as Attachment : null;
}
export function sameAttachment(turn: Pick<StoredTurn, 'attachmentJSON'>, metadata: Omit<Attachment, 'key'> | undefined): boolean {
  const saved = storedAttachment(turn);
  return saved ? !!metadata && saved.digest === metadata.digest && saved.name === metadata.name &&
    saved.mimeType === metadata.mimeType && saved.size === metadata.size : !metadata;
}
// Contact-generated albums store every image in attachments (2–3 entries) while
// attachment stays the first image. Everything else is a single attachment.
export function albumAttachments(attachment: Attachment | null | undefined, attachments: Attachment[] | null | undefined): Attachment[] {
  return attachments && attachments.length > 1 ? attachments : attachment ? [attachment] : [];
}
// The `image` query parameter selects an album image; absent means the first one.
export function albumIndex(value: string | undefined): number | null {
  if (value === undefined) return 0;
  const index = Number(value);
  return /^[0-2]$/.test(value) && Number.isSafeInteger(index) ? index : null;
}
export const publicMetadata = ({ name, mimeType, size }: Attachment | PublicAttachment): PublicAttachment => ({ name, mimeType, size });
export function publicAttachment(turn: Pick<StoredTurn, 'attachmentJSON'>): PublicAttachment | null {
  const attachment = storedAttachment(turn);
  return attachment ? { name: attachment.name, mimeType: attachment.mimeType, size: attachment.size } : null;
}
export async function attachmentMessage(env: Env, turn: Pick<StoredTurn, 'attachmentJSON' | 'userText'>): Promise<Extract<ModelMessage, { role: 'user' }>> {
  const attachment = storedAttachment(turn);
  if (!attachment) return { role: 'user', content: turn.userText };
  // The workflow saved the transcript as the message text before generation.
  // Callers label it with voiceText.
  if (attachment.mimeType.startsWith('audio/')) return { role: 'user', content: turn.userText };
  const object = await env.CONTACT_PHOTOS.get(attachment.key);
  if (!object || object.size !== attachment.size || object.size > attachmentLimit) throw new Error('ATTACHMENT_UNAVAILABLE');
  const data = `data:${attachment.mimeType};base64,${Buffer.from(await object.arrayBuffer()).toString('base64')}`;
  return { role: 'user', content: [
    // A caption-less file is a continuation of the conversation (often something
    // the contact asked for), not a request to describe it.
    { type: 'text', text: turn.userText || '[File sent without a caption. Read it in the context of the conversation: if it answers or continues something under discussion, use it to keep helping. Describe or summarize it only if nothing in the conversation explains why it was sent.]' },
    attachment.mimeType === 'application/pdf'
      ? { type: 'file', file: { filename: attachment.name, file_data: data } }
      : { type: 'image_url', image_url: { url: data } },
  ] };
}

// Registry entries survive contact deletion and failed requests. A grace period
// protects uploads that have not yet committed their turn. Cleanup is retryable.
export async function cleanAttachments(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(`SELECT object_key AS key FROM chat_attachment_object
    WHERE created_at < ? AND NOT EXISTS
      (SELECT 1 FROM chat_turn WHERE json_extract(attachment_json, '$.key') = object_key)
      AND NOT EXISTS (SELECT 1 FROM chat_turn t, json_each(COALESCE(t.assistant_messages_json, '[]')) part
        WHERE json_extract(part.value, '$.attachment.key') = object_key)
      AND NOT EXISTS (SELECT 1 FROM chat_turn t, json_each(COALESCE(t.assistant_messages_json, '[]')) part,
        json_each(COALESCE(json_extract(part.value, '$.attachments'), '[]')) album
        WHERE json_extract(album.value, '$.key') = object_key)
      AND NOT EXISTS (SELECT 1 FROM group_message WHERE json_extract(attachment_json, '$.key') = object_key)
      AND NOT EXISTS (SELECT 1 FROM group_message gm, json_each(COALESCE(gm.attachments_json, '[]')) album
        WHERE json_extract(album.value, '$.key') = object_key)
    ORDER BY created_at LIMIT 20`).bind(Date.now() - 86400000).all<{ key: string }>();
  for (const { key } of results) {
    await env.CONTACT_PHOTOS.delete(key);
    await env.DB.prepare('DELETE FROM chat_attachment_object WHERE object_key = ?').bind(key).run();
  }
}

// How a person's voice message reads to the model, matching history rows.
export const voiceText = (transcript: string) => transcript
  ? `[Voice message, transcribed] ${transcript}` : '[Voice message without recognizable speech]';
