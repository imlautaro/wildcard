import type { TaskBoard } from '~/utils/types';

// Session-owned task boards, one per chat (`contacts/:id` or `groups/:id`). Contacts
// change tasks during their turns, so an open board revalidates every five seconds.
// Every mutation returns the whole board, which replaces the cached one.
type Entry = { value: TaskBoard | null; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null; saving: number };
const boards = shallowReactive(new Map<string, Entry>());
function invalidate(key: string) { const entry = boards.get(key); if (entry) entry.revision++; boards.delete(key); }
registerSessionReset(() => { for (const key of [...boards.keys()]) invalidate(key); });
export function forgetTasks(base: string) { invalidate(base); }

export function useTasks(base: MaybeRefOrGetter<string>) {
  function entry(key: string) {
    let value = boards.get(key);
    if (!value) {
      value = reactive({ value: null, loadedAt: 0, revision: 0, request: null, error: null, saving: 0 }) as Entry;
      boards.set(key, value);
      while (boards.size > 16) invalidate(boards.keys().next().value!);
    }
    return value;
  }
  const state = computed(() => entry(toValue(base)));
  async function refresh(force = false) {
    const key = toValue(base), current = entry(key);
    if (current.request) return current.request;
    // Polling never overwrites the result of a pending edit.
    if (current.saving || (!force && Date.now() - current.loadedAt < 5000)) return;
    const revision = current.revision;
    current.request = (async () => {
      try {
        const value = await api<TaskBoard>(`${key}/tasks`);
        if (boards.get(key) !== current || current.revision !== revision || current.saving) return;
        current.value = value; current.loadedAt = Date.now(); current.error = null;
      } catch (failure) {
        if (boards.get(key) !== current || current.revision !== revision) return;
        current.loadedAt = Date.now();
        if (current.value && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) current.value = { lists: [], members: [] };
        current.error = errorMessage(failure);
      } finally { if (current.revision === revision) current.request = null; }
    })();
    return current.request;
  }
  async function mutate(path: string, method: 'POST' | 'PATCH', json: Record<string, unknown>) {
    const key = toValue(base), current = entry(key);
    current.saving++;
    current.revision++;
    current.request = null;
    try {
      const value = await api<TaskBoard>(`${key}/tasks/${path}`, { method, json });
      if (boards.get(key) === current) { current.value = value; current.loadedAt = Date.now(); current.error = null; }
    } finally { current.saving--; }
  }
  return {
    state, refresh,
    createList: (title: string, tasks: string[]) => mutate('lists', 'POST', { id: crypto.randomUUID(), title, tasks: tasks.map(title => ({ title })) }),
    renameList: (listID: string, title: string) => mutate(`lists/${listID}`, 'PATCH', { title }),
    cancelList: (listID: string) => mutate(`lists/${listID}`, 'PATCH', { status: 'canceled' }),
    addTask: (listID: string, task: Record<string, unknown>) => mutate(`lists/${listID}/tasks`, 'POST', { id: crypto.randomUUID(), ...task }),
    updateTask: (taskID: string, version: number, patch: Record<string, unknown>) => mutate(`items/${taskID}`, 'PATCH', { version, ...patch }),
  };
}
