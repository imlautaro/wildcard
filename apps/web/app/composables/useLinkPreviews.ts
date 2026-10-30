import { linkSegments } from '~/utils/messageMarkdown';

// Session cache of link cards (docs/link-previews.md). Keys include the account
// and the URL; one request per URL is shared by every bubble that shows it, a
// server-side "failed" result is remembered (no card), and transport failures
// are retried on the next render. Memory only, bounded, dropped on session reset.
export type LinkPreview = { url: string; hash: string; status: 'ready' | 'failed'; title: string | null;
  description: string | null; siteName: string | null; imageVersion: number | null };
type Entry = { value: LinkPreview | null; promise: Promise<LinkPreview | null> };
const entries = new Map<string, Entry>();
const limit = 200;
let revision = 0;

registerSessionReset(() => {
  revision += 1;
  entries.clear();
});

function load(url: string): Promise<LinkPreview | null> {
  const key = `${useSession().user.value?.id ?? ''}|${url}`;
  const existing = entries.get(key);
  if (existing) {
    entries.delete(key);
    entries.set(key, existing);
    return existing.promise;
  }
  const started = revision;
  const entry: Entry = { value: null, promise: Promise.resolve(null) };
  entry.promise = api<{ preview: LinkPreview }>('link-previews', { query: { url } }).then(({ preview }) => {
    if (started !== revision || entries.get(key) !== entry) return null;
    entry.value = preview;
    return preview;
  }).catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
    return null;
  });
  entries.set(key, entry);
  for (const oldest of entries.keys()) {
    if (entries.size <= limit) break;
    entries.delete(oldest);
  }
  return entry.promise;
}

/**
 * The link a bubble previews: the first link of a person's message; for a
 * contact, only a message with exactly one distinct link (source lists get none).
 */
export function previewLink(text: string | null | undefined, fromContact: boolean) {
  if (!text) return null;
  const urls = [...new Set(linkSegments(text).flatMap((segment) => segment.url && /^https?:/i.test(segment.url) ? [segment.url] : []))];
  return fromContact ? (urls.length === 1 ? urls[0]! : null) : urls[0] ?? null;
}

export function useLinkPreview(url: MaybeRefOrGetter<string | null | undefined>) {
  const preview = ref<LinkPreview | null>(null);
  watch(() => toValue(url), async (current) => {
    if (!current) { preview.value = null; return; }
    const key = `${useSession().user.value?.id ?? ''}|${current}`;
    preview.value = entries.get(key)?.value ?? null;
    const loaded = await load(current);
    if (toValue(url) === current) preview.value = loaded;
  }, { immediate: true });
  return preview;
}
