import type { MiniApp, MiniAppResolution } from '~/utils/types';

// Session-owned caches: one app list per contact and one resolved view per app.
// Resolved views hold connector data in memory only; nothing is persisted.
type List = { apps: MiniApp[]; loaded: boolean; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
type View = { value: MiniAppResolution | null; inputs: Record<string, string>; loadedAt: number; revision: number; request: Promise<void> | null; error: string | null };
const lists = shallowReactive(new Map<string, List>());
const views = shallowReactive(new Map<string, View>());
function invalidate<T extends { revision: number }>(map: Map<string, T>, key: string) { const entry = map.get(key); if (entry) entry.revision++; map.delete(key); }
registerSessionReset(() => { for (const key of [...lists.keys()]) invalidate(lists, key); for (const key of [...views.keys()]) invalidate(views, key); });
export function forgetMiniApps(contactID: string) {
  invalidate(lists, contactID);
  for (const key of [...views.keys()]) if (key.startsWith(`${contactID}/`)) invalidate(views, key);
}
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function useMiniApps(contactID: MaybeRefOrGetter<string>) {
  function list(id: string) {
    let value = lists.get(id);
    if (!value) {
      value = reactive({ apps: [], loaded: false, loadedAt: 0, revision: 0, request: null, error: null }) as List;
      lists.set(id, value);
      while (lists.size > 20) invalidate(lists, lists.keys().next().value!);
    }
    return value;
  }
  const state = computed(() => list(toValue(contactID)));
  async function refresh(force = false) {
    const id = toValue(contactID), entry = list(id);
    if (entry.request) return entry.request;
    if (!force && Date.now() - entry.loadedAt < 5000) return;
    const revision = entry.revision;
    entry.request = (async () => {
      try {
        const value = await api<{ miniApps: MiniApp[] }>(`contacts/${id}/mini-apps`);
        if (lists.get(id) !== entry || entry.revision !== revision) return;
        entry.apps = value.miniApps; entry.loaded = true; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (lists.get(id) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.loaded && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && [403, 404].includes(failure.status)) { entry.apps = []; entry.loaded = true; }
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  function replace(id: string, app: MiniApp | null, appID: string) {
    const entry = list(id);
    entry.apps = app ? entry.apps.map(item => item.id === app.id ? app : item) : entry.apps.filter(item => item.id !== appID);
    invalidate(views, `${id}/${appID}`);
  }
  async function approve(app: MiniApp, allowed: boolean) {
    const id = toValue(contactID);
    const result = await api<{ miniApp: MiniApp }>(`contacts/${id}/mini-apps/${app.id}/approval`, { json: { revision: app.revision, allowed } });
    replace(id, result.miniApp, app.id);
  }
  async function remove(app: MiniApp) {
    const id = toValue(contactID);
    await api(`contacts/${id}/mini-apps/${app.id}`, { method: 'DELETE' });
    replace(id, null, app.id);
  }

  function view(appID: string) {
    const key = `${toValue(contactID)}/${appID}`;
    let value = views.get(key);
    if (!value) {
      value = reactive({ value: null, inputs: {}, loadedAt: 0, revision: 0, request: null, error: null }) as View;
      views.set(key, value);
      while (views.size > 16) invalidate(views, views.keys().next().value!);
    }
    return value;
  }
  // Each load re-runs the app's remote reads, so reuse a view for a minute unless refreshed.
  async function resolve(app: MiniApp, inputs?: Record<string, string>, force = false) {
    const id = toValue(contactID), key = `${id}/${app.id}`, entry = view(app.id);
    const changed = inputs !== undefined && JSON.stringify(inputs) !== JSON.stringify(entry.inputs);
    if (entry.request && !changed) return entry.request;
    if (!force && !changed && entry.value?.revision === app.revision && Date.now() - entry.loadedAt < 60_000) return;
    if (changed) { entry.revision++; entry.inputs = inputs; }
    const revision = entry.revision;
    entry.request = (async () => {
      try {
        const value = await api<MiniAppResolution>(`contacts/${id}/mini-apps/${app.id}/resolve`, { json: { inputs: entry.inputs, timeZone: timeZone() } });
        if (views.get(key) !== entry || entry.revision !== revision) return;
        entry.value = value; entry.inputs = value.inputs; entry.loadedAt = Date.now(); entry.error = null;
      } catch (failure) {
        if (views.get(key) !== entry || entry.revision !== revision) return;
        entry.loadedAt = Date.now();
        if (entry.value && isTransientFailure(failure)) return;
        if (failure instanceof ApiError && (failure.code === 'REVIEW_REQUIRED' || failure.status === 404)) { entry.value = null; void refresh(true); }
        entry.error = errorMessage(failure);
      } finally { if (entry.revision === revision) entry.request = null; }
    })();
    return entry.request;
  }
  // The execution ID is created once per confirmed submission and reused for its retries.
  async function run(app: MiniApp, actionID: string, executionID: string, fields: Record<string, unknown>) {
    const id = toValue(contactID), entry = view(app.id);
    const outcome = await api<{ status: 'completed' | 'failed' | 'unknown' }>(`contacts/${id}/mini-apps/${app.id}/actions/${actionID}`,
      { json: { executionID, revision: app.revision, inputs: entry.inputs, fields, timeZone: timeZone() } });
    if (outcome.status === 'completed') await resolve(app, undefined, true);
    return outcome.status;
  }
  return { state, refresh, approve, remove, view, resolve, run };
}
