export type RemoteNativeDevice = { id: string; name: string; owned: number };
export type RemoteNativeAction = { id: string; turnID: string; kind: string; title: string; deviceName: string; status: string; updatedAt: number; fireAt: number };
export type RemoteNativeParticipant = { id: string; name: string };
export type RemoteNativeDelegation = { id: string; deviceID: string; participantID: string };
type Snapshot = { participants: RemoteNativeParticipant[]; delegations: RemoteNativeDelegation[]; mutating: boolean; devices: RemoteNativeDevice[]; actions: RemoteNativeAction[]; loaded: boolean; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
const snapshots = shallowReactive(new Map<string, Snapshot>());
registerSessionReset(() => { for (const value of snapshots.values()) value.revision++; snapshots.clear(); });
export function forgetRemoteNative(contactID: string) { const entry = snapshots.get(contactID); if (entry) entry.revision++; snapshots.delete(contactID); }
export function useRemoteNative(contactID: MaybeRefOrGetter<string>) {
  function snapshot(id: string) {
    let value = snapshots.get(id);
    if (!value) {
      value = reactive({ participants: [], delegations: [], mutating: false, devices: [], actions: [], loaded: false, loadedAt: 0, revision: 0, request: null, error: null }) as Snapshot;
      snapshots.set(id, value);
      while (snapshots.size > 20) { const oldest = snapshots.keys().next().value!; snapshots.get(oldest)!.revision++; snapshots.delete(oldest); }
    }
    return value;
  }
  const state = computed(() => snapshot(toValue(contactID)));
  async function refresh(force = false) {
    const id = toValue(contactID), entry = snapshot(id);
    if (entry.request) return entry.request;
    if (!force && Date.now() - entry.loadedAt < 5000) return;
    const revision = entry.revision;
    entry.request = (async () => {
      try {
        const value = await api<{ devices: RemoteNativeDevice[]; actions: RemoteNativeAction[]; participants: RemoteNativeParticipant[]; delegations: RemoteNativeDelegation[] }>(`contacts/${id}/native-remote`);
        if (snapshots.get(id) !== entry || entry.revision !== revision) return;
        entry.participants = value.participants; entry.delegations = value.delegations; entry.devices = value.devices; entry.actions = value.actions; entry.loaded = true; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (snapshots.get(id) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.loaded && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && [401,403,404].includes(failure.status)) { entry.devices = []; entry.actions = []; entry.participants = []; entry.delegations = []; entry.loaded = true; }
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  async function revoke(deviceID: string) {
    const id = toValue(contactID), entry = snapshot(id);
    await api(`contacts/${id}/native-remote/${deviceID}`, { method: 'DELETE' });
    if (snapshots.get(id) !== entry) return;
    entry.revision++; entry.request = null; entry.devices = entry.devices.filter(d => d.id !== deviceID);
    await refresh(true);
  }
  async function delegate(deviceID: string, participantID: string, allowed: boolean) {
    const id = toValue(contactID), entry = snapshot(id);
    if (entry.mutating) return;
    entry.mutating = true;
    try {
      await api(`contacts/${id}/native-remote/${deviceID}/participants/${participantID}`, { method: allowed ? 'PUT' : 'DELETE' });
      if (snapshots.get(id) !== entry) return;
      entry.revision++; entry.request = null;
      // Never retain an old permission switch while revalidating a successful mutation.
      entry.delegations = entry.delegations.filter(g => g.deviceID !== deviceID || g.participantID !== participantID);
      if (allowed) entry.delegations.push({ id: 'pending-refresh', deviceID, participantID });
      await refresh(true);
    } finally { entry.mutating = false; }
  }
  return { state, refresh, revoke, delegate };
}
