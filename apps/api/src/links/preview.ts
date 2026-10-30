import { sourceURL } from '../research/model';

// Link cards (docs/link-previews.md). The Worker fetches a public page's head
// once, under the strictly-public fetch flag, following at most three redirects
// that each pass the same URL validation, and caches title, description, site
// name and one image for every account. Clients load the image from the API.
export const previewLimits = {
  timeoutMs: 8000, htmlBytes: 512 * 1024, imageBytes: 3 * 1024 * 1024, redirects: 3,
  readyMs: 7 * 86_400_000, failedMs: 6 * 3_600_000, fetchesPerMinute: 30, readsPerMinute: 600,
} as const;
const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = typeof imageTypes[number];

export type LinkPreview = { url: string; hash: string; status: 'ready' | 'failed'; title: string | null; description: string | null;
  siteName: string | null; imageVersion: number | null };
type Row = { hash: string; url: string; status: 'ready' | 'failed'; title: string | null; description: string | null;
  siteName: string | null; imageType: string | null; fetchedAt: number; expiresAt: number };

/** Credential-free public HTTP(S) URL on a domain name, without its fragment. */
export function previewURL(value: string) {
  const url = sourceURL(value.trim());
  if (!url) return null;
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.href.length <= 2048 ? parsed.href : null;
}

export async function urlHash(url: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const imageKey = (hash: string) => `link-previews/${hash}`;

const columns = `url_hash AS hash, url, status, title, description, site_name AS siteName, image_type AS imageType,
  fetched_at AS fetchedAt, expires_at AS expiresAt`;
const publicPreview = (row: Row): LinkPreview => ({ url: row.url, hash: row.hash, status: row.status, title: row.title,
  description: row.description, siteName: row.siteName, imageVersion: row.imageType ? row.fetchedAt : null });

export async function cachedPreview(db: D1Database, hash: string) {
  const row = await db.prepare(`SELECT ${columns} FROM link_preview WHERE url_hash = ?`).bind(hash).first<Row>();
  return row && row.expiresAt > Date.now() ? publicPreview(row) : null;
}

export async function previewImage(db: D1Database, hash: string) {
  return db.prepare(`SELECT image_type AS imageType FROM link_preview WHERE url_hash = ? AND status = 'ready' AND image_type IS NOT NULL`)
    .bind(hash).first<{ imageType: ImageType }>();
}

// One GET per hop with manual redirects, so every target is validated first.
async function fetchPublic(url: string, accept: string): Promise<{ response: Response; url: string } | null> {
  let current = url;
  for (let hop = 0; hop <= previewLimits.redirects; hop++) {
    const response = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(previewLimits.timeoutMs),
      headers: { Accept: accept, 'User-Agent': 'Mozilla/5.0 (compatible; WildcardLinkPreview/1.0)' } });
    if (response.status < 300 || response.status >= 400) return { response, url: current };
    await response.body?.cancel();
    const location = response.headers.get('location');
    const next = location ? previewURL(new URL(location, current).href) : null;
    if (!next) return null;
    current = next;
  }
  return null;
}

async function readBounded(response: Response, limit: number, stopAtHead = false) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    while (size < limit) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const part = chunk.value.subarray(0, limit - size);
      size += part.byteLength;
      if (stopAtHead) {
        text += decoder.decode(part, { stream: true });
        if (/<\/head\s*>|<body[\s>]/i.test(text)) break;
      } else chunks.push(part);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  if (stopAtHead) return text + decoder.decode();
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] !== '#') return entities[code.toLowerCase()] ?? match;
    const point = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
  });
}
const clean = (value: string | undefined, max: number) => {
  const text = value ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '';
  return text ? (Array.from(text).length > max ? `${Array.from(text).slice(0, max - 1).join('')}…` : text) : null;
};

/** Open Graph, Twitter card and HTML fallbacks from a document head. */
export function pageMetadata(html: string, pageURL: string) {
  const meta = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const [, name, quoted, single, bare] of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      attributes.set(name!.toLowerCase(), quoted ?? single ?? bare ?? '');
    }
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase();
    const content = attributes.get('content');
    if (key && content && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const oembed = html.match(/<link\b[^>]*type=["']application\/json\+oembed["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  const image = meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('og:image:url')
    ?? meta.get('twitter:image') ?? meta.get('twitter:image:src');
  let imageURL: string | null = null;
  try { imageURL = image ? previewURL(new URL(decodeEntities(image.trim()), pageURL).href) : null; } catch { imageURL = null; }
  return {
    title: clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 300),
    description: clean(meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'), 500),
    siteName: clean(meta.get('og:site_name'), 120) ?? new URL(pageURL).hostname.replace(/^www\./, ''),
    imageURL,
    oembedURL: oembed ? previewURL(new URL(decodeEntities(oembed), pageURL).href) : null,
  };
}

// Sites that serve no metadata to unknown clients publish an official oEmbed
// endpoint for exactly this purpose; known providers are asked directly.
function knownOEmbed(url: string) {
  const host = new URL(url).hostname.replace(/^(www\.|m\.)/, '');
  if (['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)) return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  if (host === 'vimeo.com') return `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  return null;
}

async function oembedMetadata(endpoint: string, pageURL: string) {
  const fetched = await fetchPublic(endpoint, 'application/json');
  if (!fetched?.response.ok) { await fetched?.response.body?.cancel(); return null; }
  const text = await readBounded(fetched.response, 64 * 1024) as Uint8Array | null;
  if (!text) return null;
  const value: unknown = JSON.parse(new TextDecoder().decode(text));
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  const string = (key: string) => typeof data[key] === 'string' ? data[key] as string : undefined;
  const title = clean(string('title'), 300);
  if (!title) return null;
  return { title, description: clean(string('author_name'), 500), siteName: clean(string('provider_name'), 120) ?? new URL(pageURL).hostname,
    imageURL: string('thumbnail_url') ? previewURL(string('thumbnail_url')!) : null, oembedURL: null };
}

// Recognize the image by its bytes; a declared type alone is not trusted.
function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

async function storeImage(env: Env, hash: string, imageURL: string | null): Promise<ImageType | null> {
  if (!imageURL) return null;
  try {
    const fetched = await fetchPublic(imageURL, 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9');
    if (!fetched?.response.ok) { await fetched?.response.body?.cancel(); return null; }
    const declared = Number(fetched.response.headers.get('content-length') ?? 0);
    if (declared > previewLimits.imageBytes) { await fetched.response.body?.cancel(); return null; }
    const bytes = await readBounded(fetched.response, previewLimits.imageBytes + 1) as Uint8Array | null;
    if (!bytes || bytes.byteLength > previewLimits.imageBytes) return null;
    const type = sniffImage(bytes);
    if (!type) return null;
    await env.CONTACT_PHOTOS.put(imageKey(hash), bytes, { httpMetadata: { contentType: type } });
    return type;
  } catch { return null; }
}

/** Cached preview, or one bounded fetch of the page head and image. */
export async function loadPreview(env: Env, url: string): Promise<LinkPreview> {
  const hash = await urlHash(url);
  const cached = await cachedPreview(env.DB, hash);
  if (cached) return cached;
  let metadata: ReturnType<typeof pageMetadata> | null = null;
  try {
    const known = knownOEmbed(url);
    if (known) metadata = await oembedMetadata(known, url);
    if (!metadata) {
      const fetched = await fetchPublic(url, 'text/html,application/xhtml+xml;q=0.9');
      const type = fetched?.response.headers.get('content-type')?.toLowerCase() ?? '';
      if (fetched?.response.ok && /text\/html|application\/xhtml\+xml/.test(type)) {
        const html = await readBounded(fetched.response, previewLimits.htmlBytes, true) as string | null;
        if (html) metadata = pageMetadata(html, fetched.url);
      } else await fetched?.response.body?.cancel();
      // A page without Open Graph data may still advertise its oEmbed document.
      if (metadata && !metadata.title && metadata.oembedURL) metadata = await oembedMetadata(metadata.oembedURL, url) ?? metadata;
    }
  } catch { metadata = null; }
  const imageType = metadata ? await storeImage(env, hash, metadata.imageURL) : null;
  const now = Date.now();
  const ready = !!metadata?.title;
  await env.DB.prepare(`INSERT INTO link_preview (url_hash, url, status, title, description, site_name, image_type, fetched_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) ON CONFLICT(url_hash) DO UPDATE SET url = excluded.url, status = excluded.status,
      title = excluded.title, description = excluded.description, site_name = excluded.site_name, image_type = excluded.image_type,
      fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`)
    .bind(hash, url, ready ? 'ready' : 'failed', ready ? metadata!.title : null, ready ? metadata!.description : null,
      ready ? metadata!.siteName : null, ready ? imageType : null, now, now + (ready ? previewLimits.readyMs : previewLimits.failedMs)).run();
  return (await cachedPreview(env.DB, hash))!;
}

/** Cron: drop expired previews and their copied images. */
export async function expireLinkPreviews(env: Env) {
  const { results } = await env.DB.prepare(`SELECT url_hash AS hash, image_type AS imageType FROM link_preview
    WHERE expires_at < ? ORDER BY expires_at LIMIT 50`).bind(Date.now()).all<{ hash: string; imageType: string | null }>();
  if (!results.length) return;
  const images = results.filter(row => row.imageType).map(row => imageKey(row.hash));
  if (images.length) await env.CONTACT_PHOTOS.delete(images);
  await env.DB.prepare(`DELETE FROM link_preview WHERE url_hash IN (SELECT value FROM json_each(?1)) AND expires_at < ?2`)
    .bind(JSON.stringify(results.map(row => row.hash)), Date.now()).run();
}
