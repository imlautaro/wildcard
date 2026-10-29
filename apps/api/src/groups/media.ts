import { Hono } from 'hono';
import { admitAuthRequest } from '../lib/auth-rate-limit';
import { readPhoto, validPhoto, removePhoto } from '../photos/storage';
import { storedAttachment, attachmentLimit, mediaPage } from '../chat/attachments';
import { normalizedRecording, transcribeRecording, TranscriptionFailure } from '../chat/transcription';

const media = new Hono<{ Bindings: Env; Variables: { owner: string } }>();
export const groupPhotoKey = (id: string, version: string) => `groups/${id}/${version}.jpg`;

// Mounted after the parent group's bearer authentication and membership checks.
media.get('/photo', async (c) => {
  const groupID = c.req.param('id');
  const group = await c.env.DB.prepare(`SELECT photo_version AS version FROM chat_group WHERE id = ?
    AND EXISTS (SELECT 1 FROM group_member WHERE group_id = chat_group.id AND user_id = ?)`)
    .bind(groupID, c.get('owner')).first<{ version: string | null }>();
  if (!group?.version || (c.req.query('version') && c.req.query('version') !== group.version)) return c.body(null, 404);
  const photo = await c.env.CONTACT_PHOTOS.get(groupPhotoKey(groupID!, group.version));
  return photo ? new Response(photo.body, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(photo.size),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="group.jpg"' } }) : c.body(null, 404);
});
media.on(['PUT', 'DELETE'], '/photo', async (c) => {
  const id = c.req.param('id')!, owner = c.get('owner');
  const previous = await c.env.DB.prepare('SELECT photo_version AS version FROM chat_group WHERE id = ? AND owner_id = ?')
    .bind(id, owner).first<{ version: string | null }>();
  if (!previous) return c.json({ error: 'Only the group owner can change the photo' }, 403);
  const admission = await admitAuthRequest(c.env.DB, owner, 'group-photo-write', 12);
  if (!admission.allowed) return c.json({ error: 'Too many photo changes. Please wait a minute.' }, 429);
  let version: string | null = null;
  if (c.req.method === 'PUT') {
    if (c.req.header('Content-Type') !== 'image/jpeg') return c.json({ error: 'Choose a square JPEG photo' }, 415);
    const bytes = await readPhoto(c.req.raw);
    if (!bytes) return c.json({ error: 'Choose a photo smaller than 512 KB' }, 413);
    if (!validPhoto(bytes)) return c.json({ error: 'Choose a square JPEG between 64 and 1024 pixels' }, 422);
    version = crypto.randomUUID();
    await c.env.CONTACT_PHOTOS.put(groupPhotoKey(id, version), bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  }
  let saved: { id: string } | null;
  try {
    saved = await c.env.DB.prepare(`UPDATE chat_group SET photo_version = ?1
      WHERE id = ?2 AND owner_id = ?3 AND photo_version IS ?4 RETURNING id`)
      .bind(version, id, owner, previous.version).first<{ id: string }>();
  } catch (error) {
    if (version) c.executionCtx.waitUntil(removePhoto(c.env, groupPhotoKey(id, version)));
    throw error;
  }
  if (!saved) {
    if (version) c.executionCtx.waitUntil(removePhoto(c.env, groupPhotoKey(id, version)));
    return c.json({ error: 'The group changed. Refresh and try again.' }, 409);
  }
  if (previous.version) c.executionCtx.waitUntil(removePhoto(c.env, groupPhotoKey(id, previous.version)));
  return c.json({ photoVersion: version });
});
// Shared media for group details, newest first; membership is checked by the parent router.
media.get('/media', async (c) => {
  const kind = c.req.query('kind'), before = Number(c.req.query('before') ?? Number.MAX_SAFE_INTEGER);
  if ((kind !== 'image' && kind !== 'file') || !Number.isSafeInteger(before) || before < 1) {
    return c.json({ error: 'Choose image or file media with a valid cursor' }, 400);
  }
  const { results } = await c.env.DB.prepare(`SELECT sequence, id AS messageID, user_id AS userID, agent_id AS agentID,
    sender_name AS senderName, created_at AS createdAt, attachment_json AS attachmentJSON FROM group_message
    WHERE group_id = ?1 AND sequence < ?2 AND attachment_json IS NOT NULL
    AND (json_extract(attachment_json, '$.mimeType') LIKE 'image/%') = (?3 = 'image')
    ORDER BY sequence DESC LIMIT ?4`).bind(c.req.param('id'), before, kind, mediaPage(kind) + 1)
    .all<{ sequence: number; messageID: string; userID: string | null; agentID: string | null; senderName: string; createdAt: number; attachmentJSON: string }>();
  const page = results.slice(0, mediaPage(kind));
  return c.json({ items: page.map(({ attachmentJSON, ...message }) => {
    const { name, mimeType, size } = storedAttachment({ attachmentJSON })!;
    return { ...message, name, mimeType, size };
  }), nextBefore: results.length > page.length ? page[page.length - 1].sequence : null });
});
media.get('/messages/:messageID/attachment', async (c) => {
  const row = await c.env.DB.prepare(`SELECT attachment_json AS attachmentJSON FROM group_message
    WHERE id = ? AND group_id = ? AND EXISTS (
      SELECT 1 FROM group_member WHERE group_id = group_message.group_id AND user_id = ?)`)
    .bind(c.req.param('messageID'), c.req.param('id'), c.get('owner')).first<{ attachmentJSON: string | null }>();
  const attachment = row && storedAttachment(row);
  if (!attachment) return c.json({ error: 'Attachment unavailable' }, 404);
  const object = await c.env.CONTACT_PHOTOS.get(attachment.key);
  if (!object || object.size !== attachment.size || object.size > attachmentLimit) return c.json({ error: 'Attachment unavailable' }, 404);
  return new Response(object.body, { headers: { 'Content-Type': attachment.mimeType, 'Content-Length': String(object.size),
    'Content-Disposition': `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
media.post('/transcriptions', async (c) => {
  const id = c.req.param('id')!, owner = c.get('owner');
  if (c.env.META_CHAT_MODEL.includes('contributor') && !await c.env.DB.prepare(`SELECT user_id FROM group_member
    WHERE group_id = ? AND user_id = ? AND contributor_consent = 1`).bind(id, owner).first()) {
    return c.json({ error: 'Confirm Contributor data use in group details before recording' }, 403);
  }
  if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'audio/wav') return c.json({ error: 'Send a WAV recording' }, 415);
  if (!c.env.META_API_KEY?.trim()) return c.json({ error: 'Transcription is unavailable' }, 503);
  // Share the existing per-account budget across group and private dictation.
  const admission = await admitAuthRequest(c.env.DB, owner, 'voice-transcription', 6);
  if (!admission.allowed) return c.json({ error: 'Too many recordings. Please wait a minute.' }, 429);
  const audio = normalizedRecording(await c.req.arrayBuffer());
  if (!audio) return c.json({ error: 'Use a mono 16-bit 16 kHz WAV lasting 0.25–60 seconds' }, 400);
  try {
    const text = await transcribeRecording(c.env.META_API_KEY, audio);
    if (!await c.env.DB.prepare('SELECT user_id FROM group_member WHERE group_id = ? AND user_id = ?').bind(id, owner).first()) {
      return c.json({ error: 'Group unavailable' }, 404);
    }
    return c.json({ text });
  } catch (error) {
    if (error instanceof TranscriptionFailure) {
      if (error.code === 'NO_SPEECH' || error.code === 'TOO_LONG') return c.json({ code: error.code, error: 'Record a shorter message with clear speech' }, 422);
      if (error.code === 'REJECTED') return c.json({ error: 'Transcription is unavailable' }, 503);
    }
    console.error(JSON.stringify({ event: 'group_transcription_failed' }));
    return c.json({ error: 'Transcription could not be completed' }, 502);
  }
});
export default media;
