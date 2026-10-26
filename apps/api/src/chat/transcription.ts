// Keep voice uploads short and bounded; discard container metadata before forwarding.
export function normalizedRecording(buffer: ArrayBuffer): ArrayBuffer | null {
  if (buffer.byteLength < 44 || buffer.byteLength > 2 * 1024 * 1024) return null;
  const view = new DataView(buffer);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== buffer.byteLength) return null;
  let validFormat = false;
  let audio: Uint8Array | undefined;
  let offset = 12;
  let chunks = 0;
  for (; offset + 8 <= buffer.byteLength;) {
    if (++chunks > 128) return null;
    const name = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > buffer.byteLength) return null;
    if (name === 'fmt ') {
      if (validFormat || size < 16 || view.getUint16(start, true) !== 1
        || view.getUint16(start + 2, true) !== 1 || view.getUint32(start + 4, true) !== 16000
        || view.getUint32(start + 8, true) !== 32000 || view.getUint16(start + 12, true) !== 2
        || view.getUint16(start + 14, true) !== 16) return null;
      validFormat = true;
    } else if (name === 'data') {
      if (audio || size < 8000 || size > 60 * 32000 || size % 2 !== 0) return null;
      audio = new Uint8Array(buffer, start, size);
    }
    offset = start + size + (size % 2);
  }
  if (offset !== buffer.byteLength || !validFormat || !audio) return null;
  const wav = new ArrayBuffer(44 + audio.byteLength);
  const header = new DataView(wav);
  const output = new Uint8Array(wav);
  const writeTag = (offset: number, value: string) => output.set(new TextEncoder().encode(value), offset);
  writeTag(0, 'RIFF'); header.setUint32(4, wav.byteLength - 8, true); writeTag(8, 'WAVE');
  writeTag(12, 'fmt '); header.setUint32(16, 16, true); header.setUint16(20, 1, true);
  header.setUint16(22, 1, true); header.setUint32(24, 16000, true); header.setUint32(28, 32000, true);
  header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  writeTag(36, 'data'); header.setUint32(40, audio.byteLength, true); output.set(audio, 44);
  return wav;
}

export class TranscriptionFailure extends Error {
  constructor(readonly code: 'UNAVAILABLE' | 'REJECTED' | 'NO_SPEECH' | 'TOO_LONG') { super(code); }
}

export async function transcribeRecording(key: string, audio: ArrayBuffer): Promise<string> {
  const boundary = `wildcard-${crypto.randomUUID()}`;
  const settings = JSON.stringify({ model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' });
  // The JSON settings are a form field, without a filename, matching Meta's API.
  const body = new Blob([
    `--${boundary}\r\nContent-Disposition: form-data; name="request"\r\nContent-Type: application/json\r\n\r\n${settings}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="recording.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
    audio, `\r\n--${boundary}--\r\n`,
  ], { type: `multipart/form-data; boundary=${boundary}` });
  const response = await fetch('https://api.meta.ai/v1/asr/transcribe', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': body.type },
    body, redirect: 'manual', signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    console.error(JSON.stringify({ event: 'transcription_provider_rejected', status: response.status }));
    throw new TranscriptionFailure(response.status === 429 || response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
  }
  if (!response.body) throw new TranscriptionFailure('UNAVAILABLE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let json = '';
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 64 * 1024) throw new TranscriptionFailure('UNAVAILABLE');
      json += decoder.decode(chunk.value, { stream: true });
    }
    json += decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); }
  let value: unknown;
  try { value = JSON.parse(json); } catch { throw new TranscriptionFailure('UNAVAILABLE'); }
  if (!value || typeof value !== 'object' || !('transcript' in value) || typeof value.transcript !== 'string') {
    throw new TranscriptionFailure('UNAVAILABLE');
  }
  const transcript = value.transcript.trim();
  if (!transcript) throw new TranscriptionFailure('NO_SPEECH');
  if (Array.from(transcript).length > 4000 || transcript.includes('\0')) throw new TranscriptionFailure('TOO_LONG');
  return transcript;
}
