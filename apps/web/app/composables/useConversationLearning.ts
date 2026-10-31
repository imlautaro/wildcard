export type ConversationLearningItem = {
  key: string; kind: 'observation' | 'adjustment' | 'question'; text: string; confidence: string;
  opportunity: string; avoid: string; status: string; answer: string; updatedAt: number; expiresAt: number;
  evidence: { id: string; side: string; quote: string }[];
};
export type ConversationLearning = { enabled: boolean; profiles: {
  agentID: string; agentName: string; reviewedAt: number; items: ConversationLearningItem[];
}[] };
type Entry = { value: ConversationLearning | null; revision: number; request: Promise<void> | null; mutating: boolean; loadedAt: number };
const snapshots = shallowReactive(new Map<string, Entry>());
registerSessionReset(() => snapshots.clear());
export function forgetConversationLearning(base: string) { snapshots.delete(base); }
// Profiles name the contact, which follows its alias.
export function forgetAllConversationLearning() { snapshots.clear(); }

function snapshot(base: string): Entry {
  const existing = snapshots.get(base);
  if (existing) return existing;
  const entry = reactive({ value: null, revision: 0, request: null, mutating: false, loadedAt: 0 }) as Entry;
  snapshots.set(base, entry);
  for (const key of snapshots.keys()) {
    if (snapshots.size <= 8) break;
    if (key !== base) snapshots.delete(key);
  }
  return entry;
}

export function useConversationLearning(base: MaybeRefOrGetter<string>) {
  const entry = computed(() => snapshots.get(toValue(base)));
  const value = computed(() => entry.value?.value ?? null);
  const busy = computed(() => !!entry.value?.request || !!entry.value?.mutating);
  const error = ref<string | null>(null);
  async function refresh(force = true) {
    const path = toValue(base), current = snapshot(path);
    if (current.request) return current.request;
    if (current.mutating || (!force && current.value && Date.now() - current.loadedAt < 30_000)) return;
    const revision = current.revision;
    current.request = (async () => {
      try {
        const result = await api<ConversationLearning>(`${path}/learning`);
        if (snapshots.get(path) !== current || revision !== current.revision) return;
        current.value = result; current.loadedAt = Date.now(); error.value = null;
      } catch (failure) {
        if (snapshots.get(path) !== current || revision !== current.revision) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) forgetConversationLearning(path);
        error.value = errorMessage(failure);
      } finally { if (current.revision === revision) current.request = null; }
    })();
    return current.request;
  }
  async function mutate(enabled?: boolean) {
    const path = toValue(base), current = snapshot(path);
    if (current.mutating) return;
    current.mutating = true; current.revision++; current.request = null;
    const revision = current.revision;
    try {
      const result = await api<ConversationLearning>(`${path}/learning`, enabled === undefined
        ? { method: 'DELETE' } : { method: 'PUT', json: { enabled } });
      if (snapshots.get(path) !== current || revision !== current.revision) return;
      current.value = result; current.loadedAt = Date.now(); error.value = null;
    } catch (failure) {
      if (snapshots.get(path) !== current || revision !== current.revision) return;
      if (failure instanceof ApiError && [403, 404].includes(failure.status)) forgetConversationLearning(path);
      error.value = errorMessage(failure);
    } finally { current.mutating = false; }
  }
  return { value, busy, error, refresh, setEnabled: (enabled: boolean) => mutate(enabled), reset: () => mutate() };
}
