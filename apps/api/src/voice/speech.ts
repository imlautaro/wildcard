import { registerChatObject, discardChatObject } from '../chat/object-storage';
import { speechAccent } from '../../../../shared/voice';
import { Buffer } from 'node:buffer';
import { plainMessageMarkdown } from '../../../../shared/messageMarkdown';
import { isRecord } from '../chat/meta';
import { normalizedRecording, transcribeRecording, TranscriptionFailure } from '../chat/transcription';
import type { Attachment } from '../chat/attachments';
import { agentVoice, elevenLabsKey, voiceRepliesAvailable } from './catalog';
import { markRecording } from '../chat/presence';

export type VoiceAttachment = Attachment & { durationMs: number };
export type PublicVoice = { durationMs: number; listenedAt: number | null; ownListenedAt?: number | null; transcript: string | null };
export const isVoice = (attachment: Pick<Attachment, 'mimeType'> | null | undefined): attachment is VoiceAttachment =>
  !!attachment?.mimeType.startsWith('audio/');

// A person's voice message: base64 of the same bounded WAV that dictation accepted.
export async function parseVoice(value: unknown): Promise<{ metadata: Omit<VoiceAttachment, 'key'>; bytes: Buffer } | null> {
  if (!isRecord(value) || Object.keys(value).join(',') !== 'data' || typeof value.data !== 'string'
    || value.data.length > Math.ceil(2 * 1024 * 1024 / 3) * 4 || /[^A-Za-z0-9+/=]/.test(value.data)) return null;
  const decoded = Buffer.from(value.data, 'base64');
  if (decoded.toString('base64') !== value.data) return null;
  const wav = normalizedRecording(decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer);
  if (!wav) return null;
  const bytes = Buffer.from(wav);
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  // 16 kHz mono PCM16 is 32 bytes per millisecond after the 44-byte header.
  return { metadata: { name: 'Voice message.wav', mimeType: 'audio/wav', size: bytes.length, digest,
    durationMs: Math.round((bytes.length - 44) / 32) }, bytes };
}

// Short acknowledgements and long or structured answers stay text.
export function voiceSuitable(text: string) {
  const length = Array.from(text.trim()).length;
  return length >= 60 && length <= 600
    // Keep visible chat effects as text instead of reading their spelling aloud.
    && !/\p{Extended_Pictographic}|\p{Regional_Indicator}|(\p{L})\1{2,}|(?:^|[^\p{L}])(?:ha|ja){2,}(?=$|[^\p{L}])/iu.test(text)
    && !/```|`[^`\n]+`|https?:\/\/|www\.|\]\(/i.test(text)
    && !/^\s*([-*+]|\d+[.)])\s/m.test(text) && !/^\s*#{1,6}\s/m.test(text) && !/\|.*\|/.test(text);
}

// Whether a private contact's suitable replies are spoken (super admin flag, provider key, opt-in).
export async function privateVoiceReplies(env: Env, contactID: string) {
  return !!await env.DB.prepare('SELECT 1 FROM contact WHERE id = ? AND voice_messages_enabled = 1').bind(contactID).first()
    && await voiceRepliesAvailable(env);
}

// Speak `text` with the agent's voice, store the MP3 and return its attachment.
// Any failure returns null so the caller publishes the message as text.
export async function speakMessage(env: Env, input: { agentID: string; turnID: string; attempt: number; text: string; key: string }): Promise<VoiceAttachment | null> {
  const recordingUntil = Date.now() + 120_000;
  try {
    if (!await voiceRepliesAvailable(env) || !voiceSuitable(input.text)) return null;
    await markRecording(env.DB, input.turnID, input.attempt, recordingUntil);
    const source = await env.DB.prepare(`SELECT contact_id AS scope FROM chat_turn WHERE id=?1 AND attempt=?2
      UNION ALL SELECT group_id FROM group_reply WHERE id=?1 AND attempt=?2`).bind(input.turnID,input.attempt).first<{scope:string}>();
    if (!source) return null;
    const existing = await env.CONTACT_PHOTOS.head(input.key);
    const bytes = existing ? Buffer.from(await (await env.CONTACT_PHOTOS.get(input.key))!.arrayBuffer()) : await synthesize(env, input.agentID, input.text);
    if (!bytes) return null;
    if (!existing) {
      await registerChatObject(env,input.key,source.scope);
      await env.CONTACT_PHOTOS.put(input.key, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
    }
    if (!await env.DB.prepare(`SELECT 1 FROM chat_turn WHERE id=?1 AND attempt=?2
      UNION ALL SELECT 1 FROM group_reply WHERE id=?1 AND attempt=?2`).bind(input.turnID,input.attempt).first()) {
      await discardChatObject(env,input.key,source.scope); return null;
    }
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    // mp3_44100_128 is constant bitrate: 16 bytes per millisecond.
    return { name: 'Voice message.mp3', mimeType: 'audio/mpeg', size: bytes.length, digest, key: input.key, durationMs: Math.round(bytes.length / 16) };
  } catch {
    console.error(JSON.stringify({ event: 'voice_reply_skipped' }));
    return null;
  } finally {
    // Clears this turn's overlay, including one the workflow set before synthesis.
    await env.DB.prepare(`UPDATE agent_presence SET recording_until = NULL WHERE agent_id = ?1 AND (recording_until = ?2
      OR EXISTS (SELECT 1 FROM agent_attention WHERE agent_id = ?1 AND turn_id = ?3 AND attempt = ?4))`)
      .bind(input.agentID, recordingUntil, input.turnID, input.attempt).run().catch(() => {
        console.error(JSON.stringify({ event: 'recording_presence_cleanup_deferred' }));
      });
  }
}

async function synthesize(env: Env, agentID: string, text: string): Promise<Buffer | null> {
  const voiceID = await agentVoice(env, agentID);
  const key = elevenLabsKey(env);
  if (!voiceID || !key) return null;
  const preference = await env.DB.prepare('SELECT speech_accent AS accent FROM contact_agent WHERE id = ?')
    .bind(agentID).first<{ accent: string | null }>();
  const accent = speechAccent(preference?.accent);
  // Delivery tags are server-controlled and never enter transcripts or chat history.
  const spoken = plainMessageMarkdown(text).replace(/[\[\]]/g, '');
  const directed = `[casual, conversational delivery]${accent ? ` [${accent.direction}]` : ''} ${spoken}`;
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceID)}?output_format=mp3_44100_128`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(60_000),
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: directed, model_id: 'eleven_v4',
      voice_settings: { stability: 0.4, similarity_boost: 0.75 } }),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: 'voice_provider_rejected', status: response.status }));
    return null;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 5 * 1024 * 1024) return null;
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return size ? Buffer.concat(chunks) : null;
}

// Clients render the bubble from this; storage keys never leave the API.
export function publicVoice(attachment: Attachment | null | undefined, listenedAt: number | null, transcript: string | null): PublicVoice | null {
  return isVoice(attachment) ? { durationMs: attachment.durationMs, listenedAt, transcript } : null;
}

// Transcribe a stored voice message once. No recognizable speech is an empty
// transcript, not a failure; provider errors propagate for Workflow retries.
export async function transcribeVoice(env: Env, attachment: Attachment): Promise<string> {
  const object = await env.CONTACT_PHOTOS.get(attachment.key);
  if (!object) throw new Error('ATTACHMENT_UNAVAILABLE');
  try { return await transcribeRecording(env.META_API_KEY, await object.arrayBuffer()); }
  catch (error) {
    if (error instanceof TranscriptionFailure && error.code === 'NO_SPEECH') return '';
    throw error;
  }
}
