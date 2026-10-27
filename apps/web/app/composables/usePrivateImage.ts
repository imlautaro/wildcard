// Bounded, memory-only cache for private images (avatars and chat thumbnails).
// The API marks bytes no-store, so nothing is written to the browser disk cache.
// Keys include the account, the access path, and an immutable version or ID.
type Entry = { url: string | null; promise: Promise<string | null> };
const entries = new Map<string, Entry>();
const limit = 150;

registerSessionReset(() => {
  for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  entries.clear();
});

function evict() {
  while (entries.size > limit) {
    const [key, entry] = entries.entries().next().value!;
    if (entry.url) URL.revokeObjectURL(entry.url);
    entries.delete(key);
  }
}

export function privateImageURL(path: string): Promise<string | null> {
  const key = `${useSession().user.value?.id ?? ''}|${path}`;
  const existing = entries.get(key);
  if (existing) {
    entries.delete(key);
    entries.set(key, existing);
    return existing.promise;
  }
  const entry: Entry = { url: null, promise: Promise.resolve(null) };
  entry.promise = apiBlob(path)
    .then((blob) => {
      if (entries.get(key) !== entry) return null;
      entry.url = URL.createObjectURL(blob);
      return entry.url;
    })
    .catch(() => {
      // Failed loads are retried on the next request rather than cached.
      if (entries.get(key) === entry) entries.delete(key);
      return null;
    });
  entries.set(key, entry);
  evict();
  return entry.promise;
}

export function usePrivateImage(path: MaybeRefOrGetter<string | null | undefined>) {
  const url = ref<string | null>(null);
  watch(() => toValue(path), async (current) => {
    if (!current) { url.value = null; return; }
    const loaded = await privateImageURL(current);
    if (toValue(path) === current) url.value = loaded;
  }, { immediate: true });
  return url;
}
