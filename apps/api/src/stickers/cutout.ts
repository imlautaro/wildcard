import { Buffer } from 'node:buffer';
import jpeg from 'jpeg-js';
import * as UPNG from 'upng-js';
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from '@meta-sam/parser';
import { museCompletion } from '../chat/meta';

// Turns a photo into a sticker: Meta's SAM 3.1 finds the subject, then the mask becomes the
// alpha channel of a cropped, downscaled PNG (docs/stickers.md#cutout). Muse Image cannot
// return transparency and Workers have no Canvas, so the pixels are composited in pure JS.
// Everything is bounded: source dimensions, SAM time and output size.

export const stickerEdge = 512;
export const maxSourceEdge = 2048;
const maxSourcePixels = 6_000_000;
const maxStickerBytes = 300 * 1024;

export type CutoutFailure = 'UNSUPPORTED_IMAGE' | 'NO_SUBJECT' | 'SEGMENTATION_UNAVAILABLE';
export class CutoutError extends Error {
  constructor(readonly code: CutoutFailure) { super(code); }
}
type Raster = { width: number; height: number; data: Uint8Array };

// Dimensions are read from the headers first so an image bomb is rejected before decoding.
function dimensions(bytes: Uint8Array): { type: 'jpeg' | 'png'; width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1]!;
      if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) { offset += marker === 0xff ? 1 : 2; continue; }
      const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        return { type: 'jpeg', height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export function decodeImage(bytes: Uint8Array): Raster {
  const info = dimensions(bytes);
  if (!info || info.width < 32 || info.height < 32 || info.width > maxSourceEdge || info.height > maxSourceEdge
    || info.width * info.height > maxSourcePixels) throw new CutoutError('UNSUPPORTED_IMAGE');
  try {
    if (info.type === 'jpeg') {
      const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 96, maxResolutionInMP: 7 });
      return { width: image.width, height: image.height, data: image.data };
    }
    const png = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const frame = UPNG.toRGBA8(png)[0];
    if (!frame) throw new Error('empty');
    const data = new Uint8Array(frame);
    // Transparent regions of a PNG source become white so SAM sees ordinary pixels.
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]!;
      if (alpha < 255) for (let c = 0; c < 3; c++) data[i + c] = Math.round((data[i + c]! * alpha + 255 * (255 - alpha)) / 255);
      data[i + 3] = 255;
    }
    return { width: png.width, height: png.height, data };
  } catch { throw new CutoutError('UNSUPPORTED_IMAGE'); }
}

async function* serverEvents(response: Response): AsyncGenerator<ResponsesEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  let size = 0;
  const reader = response.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) throw new Error('SEGMENTATION_TOO_LARGE');
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (data && data !== '[DONE]') yield JSON.parse(data) as ResponsesEvent;
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
}

type Subject = { left: number; top: number; right: number; bottom: number; width: number; height: number; mask: Uint8Array };

// One SAM request for a short noun phrase. The largest confident match wins (a group
// photo yields the most prominent person). Returns null when nothing matches.
async function segment(env: Env, jpegOrPng: { mime: string; bytes: Uint8Array }, concept: string): Promise<Subject | null> {
  const response = await fetch('https://api.meta.ai/v1/responses', {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${env.META_API_KEY}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model: 'sam-3.1', stream: true, metadata: { include_confidence: 'true', mask_encoding: 'one_bit' },
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: concept },
        { type: 'input_image', image_url: `data:${jpegOrPng.mime};base64,${Buffer.from(jpegOrPng.bytes).toString('base64')}` }] }] }),
  }).catch(() => null);
  if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new CutoutError('SEGMENTATION_UNAVAILABLE'); }
  let result;
  try { result = await parseImageStream(serverEvents(response)).finalResult; }
  catch { throw new CutoutError('SEGMENTATION_UNAVAILABLE'); }
  if (result.outcome.status !== 'completed') throw new CutoutError('SEGMENTATION_UNAVAILABLE');
  let best: Subject | null = null, bestArea = 0;
  for (const record of recordsOfKind(result.records, 'mask')) {
    const { left, top, right, bottom } = record.bounds;
    if ((record.confidence ?? 1) < 0.35 || right <= left || bottom <= top) continue;
    const mask = decodeMaskToRaster(record.mask);
    let area = 0;
    for (const bit of mask) area += bit;
    if (area > bestArea) { bestArea = area; best = { left, top, right, bottom, width: record.mask.width, height: record.mask.height, mask }; }
  }
  // Specks are not a subject: require a visible share of a small thumbnail.
  return best && bestArea >= 0.02 * best.width * best.height ? best : null;
}

// Alpha = SAM mask sampled bilinearly in source coordinates, sharpened a little so edges
// stay crisp after the mask's lower resolution. Cropped to the subject with a 6% margin.
function composite(image: Raster, subject: Subject): { png: Uint8Array; width: number; height: number } {
  const { left, top, right, bottom } = subject;
  const spanX = right - left, spanY = bottom - top;
  const maskAt = (x: number, y: number) => {
    const fx = (x - left) / spanX * subject.width - 0.5, fy = (y - top) / spanY * subject.height - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const at = (xx: number, yy: number) => xx < 0 || yy < 0 || xx >= subject.width || yy >= subject.height ? 0 : subject.mask[yy * subject.width + xx]!;
    return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
  };
  const pad = Math.round(Math.max(spanX, spanY) * 0.06);
  const x0 = Math.max(0, left - pad), y0 = Math.max(0, top - pad);
  const x1 = Math.min(image.width, right + pad), y1 = Math.min(image.height, bottom + pad);
  const cropWidth = x1 - x0, cropHeight = y1 - y0;
  const scale = Math.min(1, stickerEdge / Math.max(cropWidth, cropHeight));
  const width = Math.max(1, Math.round(cropWidth * scale)), height = Math.max(1, Math.round(cropHeight * scale));
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x0 + (x + 0.5) / scale, sy = y0 + (y + 0.5) / scale;
      const from = (Math.min(image.height - 1, Math.floor(sy)) * image.width + Math.min(image.width - 1, Math.floor(sx))) * 4;
      const to = (y * width + x) * 4;
      out[to] = image.data[from]!; out[to + 1] = image.data[from + 1]!; out[to + 2] = image.data[from + 2]!;
      out[to + 3] = Math.round(Math.max(0, Math.min(1, (maskAt(sx, sy) - 0.5) * 1.6 + 0.5)) * 255);
    }
  }
  return { png: encodeSticker(out, width, height), width, height };
}

// A 256-color palette with alpha keeps a 512-pixel sticker around 100–200 KB.
export function encodeSticker(rgba: Uint8Array, width: number, height: number): Uint8Array {
  for (const colors of [256, 128, 64]) {
    const bytes = new Uint8Array(UPNG.encode([rgba.buffer.slice(rgba.byteOffset, rgba.byteOffset + rgba.byteLength) as ArrayBuffer], width, height, colors));
    if (bytes.length <= maxStickerBytes || colors === 64) return bytes;
  }
  throw new Error('unreachable');
}

// A single short noun phrase for SAM when "person" found nothing (an object, a pet).
async function nameSubject(env: Env, image: { mime: string; bytes: Uint8Array }): Promise<string | null> {
  try {
    const answer = await museCompletion(env, [{ role: 'user', content: [
      { type: 'text', text: 'Name the single main subject of this photo as a short lowercase noun phrase (1–4 words, e.g. "orange cat", "red sneaker"). Reply with only that phrase.' },
      { type: 'image_url', image_url: { url: `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}` } }] }],
    'muse-spark-1.3', { maxTokens: 24, reasoning: 'minimal' });
    const phrase = typeof answer.content === 'string' ? answer.content.trim().toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').slice(0, 40) : '';
    return phrase.length >= 2 ? phrase : null;
  } catch { return null; }
}

export type Cutout = { png: Uint8Array; width: number; height: number };
// subject: an optional noun phrase from the person; defaults to "person", then to a model-named subject.
export async function cutout(env: Env, bytes: Uint8Array, subject?: string): Promise<Cutout> {
  const image = decodeImage(bytes);
  const info = dimensions(bytes)!;
  const source = { mime: info.type === 'png' ? 'image/png' : 'image/jpeg', bytes };
  let found = await segment(env, source, subject ?? 'person');
  if (!found && !subject) {
    const named = await nameSubject(env, source);
    if (named && named !== 'person') found = await segment(env, source, named);
  }
  if (!found) throw new CutoutError('NO_SUBJECT');
  return composite(image, found);
}
