import { defaultPersonality, type Personality, type PersonalitySnapshot } from '../../../../shared/personality';

type Editor = { draft: Personality; baseline: string; revision: number; saved: boolean };
type Entry = { value: PersonalitySnapshot | null; revision: number; request: Promise<void> | null; saving: boolean; editor: Editor };
const snapshots = shallowReactive(new Map<string, Entry>());
registerSessionReset(() => snapshots.clear());
export function forgetPersonality(id: string) { snapshots.delete(id); }

function snapshot(id: string): Entry {
  let entry = snapshots.get(id);
  if (entry) return entry;
  const profile = defaultPersonality();
  entry = reactive({ value: null, revision: 0, request: null, saving: false,
    editor: { draft: profile, baseline: JSON.stringify(profile), revision: 0, saved: false } }) as Entry;
  snapshots.set(id, entry);
  for (const [key, item] of snapshots) {
    if (snapshots.size <= 8) break;
    if (key !== id && !item.saving) snapshots.delete(key);
  }
  return entry;
}

export function usePersonality(contactID: MaybeRefOrGetter<string>) {
  const editor = snapshot(toValue(contactID)).editor;
  const entry = computed(() => snapshots.get(toValue(contactID)));
  const value = computed(() => entry.value?.value ?? null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  async function refresh() {
    const id = toValue(contactID), current = snapshot(id);
    if (current.request) return current.request;
    if (current.saving) return;
    const revision = current.revision;
    busy.value = true;
    current.request = (async () => {
      try {
        const result = await api<PersonalitySnapshot>(`contacts/${id}/personality`);
        if (snapshots.get(id) !== current || current.revision !== revision) return;
        result.personality.specialties ??= '';
        current.value = result;
        error.value = null;
      } catch (failure) {
        if (snapshots.get(id) !== current || current.revision !== revision) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) forgetPersonality(id);
        error.value = errorMessage(failure);
      } finally {
        if (current.revision === revision) current.request = null;
        busy.value = false;
      }
    })();
    return current.request;
  }
  async function save(personality: Personality, expectedRevision: number) {
    const id = toValue(contactID), current = snapshot(id);
    if (current.saving) return null;
    current.saving = true;
    current.revision += 1;
    current.request = null;
    const revision = current.revision;
    busy.value = true;
    error.value = null;
    try {
      const result = await api<PersonalitySnapshot>(`contacts/${id}/personality`, { method: 'PUT',
        json: { personality, revision: expectedRevision } });
      if (snapshots.get(id) !== current || current.revision !== revision) return null;
      result.personality.specialties ??= '';
      current.value = result;
      return result;
    } catch (failure) {
      if (snapshots.get(id) === current) {
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) forgetPersonality(id);
        error.value = errorMessage(failure);
      }
      return null;
    } finally { current.saving = false; busy.value = false; }
  }
  async function generate() {
    const id = toValue(contactID), current = snapshot(id);
    if (current.saving || current.request || !current.value) return;
    current.saving = true;
    current.revision++;
    current.request = null;
    const mutation = current.revision;
    const baselineRevision = current.editor.revision;
    error.value = null;
    try {
      const result = await api<{ personality: Personality; revision: number }>(`contacts/${id}/personality/generate`, { json: {} });
      if (snapshots.get(id) !== current || current.revision !== mutation) return;
      if (result.revision !== baselineRevision) throw new Error(translate('contacts.personality.changed'));
      current.editor.draft = result.personality;
      current.editor.saved = false;
    } catch (failure) {
      if (snapshots.get(id) === current) {
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) forgetPersonality(id);
        error.value = errorMessage(failure);
      }
    } finally { current.saving = false; }
  }
  return { value, busy: computed(() => busy.value || !!entry.value?.saving || !!entry.value?.request), error, refresh, save, generate, editor };
}
