import type { PushEnvironment } from './delivery';

// Browser Web Push (RFC 8030) with aes128gcm payload encryption (RFC 8291) and
// VAPID identification (RFC 8292), built on WebCrypto so it runs in Workers.
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are base64url: the uncompressed P-256
// point (65 bytes) and the raw private scalar (32 bytes).

// Only browser vendors' push services are accepted as subscription endpoints, so
// a registration can never make the Worker call an arbitrary host.
const pushHosts = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9.-]+\.notify\.windows\.com$/];

export function allowedPushEndpoint(value: string): URL | null {
  if (value.length > 1000) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  return pushHosts.some((pattern) => pattern.test(url.hostname)) ? url : null;
}

export const webPushConfigured = (env: PushEnvironment) =>
  !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

const encoder = new TextEncoder();
const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString('base64url');
const fromB64 = (text: string) => new Uint8Array(Buffer.from(text, 'base64url'));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

async function hkdf(salt: Uint8Array, secret: ArrayBuffer | Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** RFC 8291 single-record body. `ephemeral` and `salt` are injectable for test vectors only. */
export async function encryptWebPush(plaintext: Uint8Array, p256dh: string, authSecret: string,
  entropy?: { ephemeral: CryptoKeyPair; salt: Uint8Array }): Promise<Uint8Array> {
  const receiver = fromB64(p256dh);
  const auth = fromB64(authSecret);
  if (receiver.length !== 65 || receiver[0] !== 4 || auth.length !== 16) throw new Error('INVALID_SUBSCRIPTION_KEYS');
  const ephemeral = entropy?.ephemeral ?? await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const salt = entropy?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const sender = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey) as ArrayBuffer);
  const receiverKey = await crypto.subtle.importKey('raw', receiver, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, ephemeral.privateKey, 256);
  const ikm = await hkdf(auth, shared, concat(encoder.encode('WebPush: info\0'), receiver, sender), 32);
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (only) record.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = sender.length;
  return concat(header, sender, cipher);
}

async function vapidHeader(env: PushEnvironment, endpoint: URL): Promise<string> {
  const publicKey = fromB64(env.VAPID_PUBLIC_KEY!);
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('INVALID_VAPID_KEY');
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', x: b64(publicKey.slice(1, 33)), y: b64(publicKey.slice(33)), d: env.VAPID_PRIVATE_KEY!,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const input = `${b64(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))}.${b64(encoder.encode(JSON.stringify({
    aud: endpoint.origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT,
  })))}`;
  // WebCrypto already returns the raw r||s form JWS requires.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
  return `vapid t=${input}.${b64(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

export async function sendWebPush(env: PushEnvironment,
  item: { endpoint: string; p256dh: string; auth: string; expiresAt: number; topic: string }, payload: string) {
  const endpoint = allowedPushEndpoint(item.endpoint);
  // A stored endpoint outside the allowlist is treated as gone.
  if (!endpoint) return { ok: false, status: 410 };
  let body: Uint8Array;
  // Malformed stored keys can never succeed: treat the subscription as gone.
  try { body = await encryptWebPush(encoder.encode(payload), item.p256dh, item.auth); }
  catch (error) { if ((error as Error).message === 'INVALID_SUBSCRIPTION_KEYS') return { ok: false, status: 410 }; throw error; }
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: await vapidHeader(env, endpoint), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream',
      ttl: String(Math.max(0, Math.min(86_400, Math.floor((item.expiresAt - Date.now()) / 1000)))),
      urgency: 'high', topic: item.topic,
    },
    body,
  });
  await response.body?.cancel();
  return { ok: response.ok, status: response.status };
}

export async function webPushTopic(id: string) {
  return b64(await crypto.subtle.digest('SHA-256', encoder.encode(id))).slice(0, 32);
}
