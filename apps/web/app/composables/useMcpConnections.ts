export type McpTool = { name: string; description: string; fingerprint: string; allowed: boolean; inputSchema: Record<string, unknown> };
export type McpConnection = { id: string; name: string; url: string; authenticated: boolean; authType: 'none' | 'bearer' | 'oauth'; oauthStatus: string | null; oauthConfigured: boolean; oauthIssuer: string | null; oauthScope: string | null; tools: McpTool[] };
type Snapshot = { value: McpConnection[] | null; callbackURL: string | null; revision: number; request: Promise<void> | null };
const snapshots = shallowReactive(new Map<string, Snapshot>());
registerSessionReset(() => { if (import.meta.client) sessionStorage.removeItem('wildcard.mcp.oauth'); for (const entry of snapshots.values()) entry.revision++; snapshots.clear(); });
export function forgetMcpConnections(id: string) { const entry = snapshots.get(id); if (entry) entry.revision++; snapshots.delete(id); }
export function useMcpConnections(contactID: MaybeRefOrGetter<string>) {
  const connections = computed(() => snapshots.get(toValue(contactID))?.value ?? null);
  const callbackURL = computed(() => snapshots.get(toValue(contactID))?.callbackURL ?? null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  async function refresh() {
    const id = toValue(contactID);
    let entry = snapshots.get(id);
    if (!entry) {
      entry = reactive({ value: null, callbackURL: null, revision: 0, request: null }) as Snapshot;
      snapshots.set(id, entry);
      while (snapshots.size > 8) forgetMcpConnections(snapshots.keys().next().value!);
    }
    if (entry.request) return entry.request;
    const current = entry, revision = current.revision;
    current.request = (async () => {
      try {
        const result = await api<{ connections: McpConnection[]; callbackURL: string | null }>(`contacts/${id}/mcp`);
        if (snapshots.get(id) === current && current.revision === revision) { current.value = result.connections; current.callbackURL = result.callbackURL; error.value = null; }
      } catch (failure) {
        if (snapshots.get(id) !== current || current.revision !== revision) return;
        if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) forgetMcpConnections(id);
        error.value = errorMessage(failure);
      } finally { if (current.revision === revision) current.request = null; }
    })();
    return current.request;
  }
  async function mutate<T = unknown>(suffix: string, method: string, json?: unknown) {
    if (busy.value) return false;
    const id = toValue(contactID), current = snapshots.get(id);
    if (current) { current.revision++; current.request = null; }
    busy.value = true; error.value = null;
    try { const result = await api<T>(`contacts/${id}/mcp${suffix}`, { method, json }); await refresh(); return result ?? true; }
    catch (failure) {
      if (current && snapshots.get(id) !== current) return false;
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) forgetMcpConnections(id);
      error.value = errorMessage(failure); return false;
    } finally { busy.value = false; }
  }
  return { connections, callbackURL, busy, error, refresh, mutate };
}
