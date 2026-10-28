export type McpAccess = { id: string; name: string; granted: number; agentID?: string; agentName?: string };
type AccessSnapshot = { value: McpAccess[] | null; revision: number; request: Promise<void> | null };
const accessSnapshots = shallowReactive(new Map<string, AccessSnapshot>());
registerSessionReset(() => { for (const entry of accessSnapshots.values()) entry.revision++; accessSnapshots.clear(); });
export function invalidateMcpAccess() {
  for (const entry of accessSnapshots.values()) { entry.revision++; entry.request = null; }
}
export function useMcpAccess(path: MaybeRefOrGetter<string>) {
  const entries = computed(() => accessSnapshots.get(toValue(path))?.value ?? null);
  const busy = ref(false), error = ref<string | null>(null);
  async function refresh() {
    const key = toValue(path);
    let entry = accessSnapshots.get(key);
    if (!entry) {
      entry = reactive({ value: null, revision: 0, request: null }) as AccessSnapshot;
      accessSnapshots.set(key, entry);
      while (accessSnapshots.size > 8) { const oldest = accessSnapshots.keys().next().value!; accessSnapshots.get(oldest)!.revision++; accessSnapshots.delete(oldest); }
    }
    if (entry.request) return entry.request;
    const current = entry, revision = current.revision;
    current.request = (async () => {
      try {
        const result = await api<{ connections: McpAccess[] }>(key);
        if (accessSnapshots.get(key) === current && current.revision === revision) { current.value = result.connections; error.value = null; }
      } catch (failure) {
        if (accessSnapshots.get(key) !== current || current.revision !== revision) return;
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { current.revision++; accessSnapshots.delete(key); }
        error.value = errorMessage(failure);
      } finally { if (current.revision === revision) current.request = null; }
    })();
    return current.request;
  }
  async function save(item: McpAccess) {
    if (busy.value) return;
    const key = toValue(path), current = accessSnapshots.get(key);
    if (current) { current.revision++; current.request = null; }
    busy.value = true; error.value = null;
    try {
      await api(`${key}/${item.id}`, { method: 'PATCH', json: { allowed: !item.granted, ...(item.agentID ? { agentID: item.agentID } : {}) } });
      // Contact revocation can remove group grants. Invalidate every access snapshot.
      for (const entry of accessSnapshots.values()) { entry.revision++; entry.request = null; }
      await refresh();
    } catch (failure) {
      if (current && accessSnapshots.get(key) !== current) return;
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { if (current) current.revision++; accessSnapshots.delete(key); }
      error.value = errorMessage(failure);
    } finally { busy.value = false; }
  }
  return { entries, busy, error, refresh, save };
}
