export const photoKey = (owner: string, contactID: string, version: string) =>
  `contacts/${owner}/${contactID}/${version}.jpg`;

export async function photoResponse(env: Env, owner: string, contactID: string, version: string): Promise<Response> {
  const object = await env.CONTACT_PHOTOS.get(photoKey(owner, contactID, version));
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: {
    'Content-Type': 'image/jpeg', 'Content-Length': String(object.size),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename="profile.jpg"',
  } });
}

// Check JPEG markers and dimensions without decoding untrusted pixels in the Worker.
export function validPhoto(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return false;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return false;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width >= 64 && width <= 1024 && height === width;
    }
    offset += length;
  }
  return false;
}

export async function removePhoto(env: Env, key: string) {
  try { await env.CONTACT_PHOTOS.delete(key); }
  catch { console.error(JSON.stringify({ event: 'contact_photo_cleanup_failed' })); }
}

export async function readPhoto(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) return null;
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
