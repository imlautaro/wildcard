import type { ContactEnergy } from '~/utils/types';

// Session snapshots of creator-only agent energy, like iOS NavigationSnapshotCache:
// the last server value renders synchronously (including zero), requests are
// deduplicated, and a reset invalidates earlier reads. Memory only, at most eight.
type Snapshot = { value: ContactEnergy | null; revision: number; request: Promise<void> | null };
const snapshots = shallowReactive(new Map<string, Snapshot>());
const limit = 8;

registerSessionReset(() => snapshots.clear());

function snapshot(id: string) {
  let entry = snapshots.get(id);
  if (entry) return entry;
  entry = reactive({ value: null, revision: 0, request: null }) as Snapshot;
  snapshots.set(id, entry);
  for (const key of snapshots.keys()) {
    if (snapshots.size <= limit) break;
    if (key !== id) snapshots.delete(key);
  }
  return entry;
}

export function forgetContactEnergy(id: string) {
  snapshots.delete(id);
}

export function useContactEnergy(contactID: MaybeRefOrGetter<string>) {
  const entry = computed(() => snapshots.get(toValue(contactID)) ?? null);
  const energy = computed(() => entry.value?.value ?? null);
  const busy = ref(false);
  const error = ref<string | null>(null);

  async function refresh(reset = false) {
    const id = toValue(contactID);
    const current = snapshot(id);
    if (current.request && !reset) return current.request;
    if (reset) current.revision += 1;
    const revision = current.revision;
    busy.value = true;
    current.request = (async () => {
      try {
        const result = await api<{ energy: ContactEnergy }>(`contacts/${id}/energy${reset ? '/reset' : ''}`, { method: reset ? 'POST' : 'GET' });
        if (snapshots.get(id) !== current || revision !== current.revision) return;
        current.value = result.energy;
        error.value = null;
      } catch (failure) {
        if (failure instanceof ApiError && failure.status === 404) {
          forgetContactEnergy(id);
          error.value = translate('contacts.energy.unavailable');
        } else {
          error.value = errorMessage(failure);
        }
      } finally {
        if (snapshots.get(id) === current) current.request = null;
        busy.value = false;
      }
    })();
    return current.request;
  }

  return { energy, busy, error, refresh, reset: () => refresh(true) };
}
