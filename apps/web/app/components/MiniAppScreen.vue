<script setup lang="ts">
import type { MiniAppAction, MiniAppComponent, MiniAppComposer } from '~/utils/types';

// A mini app opens as its own screen: a top bar with the app's menu, the current tab,
// an optional composer pinned to the bottom and a tab bar for tabbed apps.
// `base` is `contacts/<id>` (a private app) or `groups/<id>` (shared by the group); `back` is its chat.
const props = defineProps<{ base: string; appId: string; back: string }>();
const appID = computed(() => props.appId);
const apps = useMiniApps(() => props.base);
const app = computed(() => apps.state.value.apps.find(item => item.id === appID.value) ?? null);
const view = computed(() => apps.view(appID.value));
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busyAction = ref<string | null>(null);
// An uncertain submission keeps its execution ID so a retry can never run twice.
const pendingExecution = ref<{ actionID: string; executionID: string; fields: string } | null>(null);
const selectedTab = ref<string | null>(null);
const menuOpen = ref(false);
const draft = ref('');
const tabs = computed(() => app.value?.status === 'enabled' && (app.value.tabs?.length ?? 0) > 1 ? app.value.tabs! : []);
const currentTab = computed(() => tabs.value.find(t => t.id === selectedTab.value) ?? tabs.value[0] ?? null);
const components = computed(() => {
  const value = view.value.value;
  if (!value) return null;
  return currentTab.value ? value.tabs?.find(t => t.id === currentTab.value!.id)?.view ?? (currentTab.value.id === tabs.value[0]?.id ? value.view : []) : value.view;
});
const composer = computed(() => components.value?.find((c): c is MiniAppComposer => c.type === 'composer') ?? null);
const firstScreen = computed(() => !currentTab.value || currentTab.value.id === tabs.value[0]?.id);
useHead({ title: computed(() => app.value?.title ?? 'Mini app') });

const reads = computed(() => app.value?.tools.filter(t => t.role === 'read') ?? []);
const writes = computed(() => app.value?.tools.filter(t => t.role === 'write') ?? []);
function findAction(components: MiniAppComponent[], id: string): MiniAppAction | null {
  for (const item of components) {
    if (item.type === 'action' && item.id === id) return item;
    if (item.type === 'tile' && item.action?.id === id) return item.action;
    if (item.type === 'section' || item.type === 'grid') { const found = findAction(item.children, id); if (found) return found; }
  }
  return null;
}
// Actions can sit in any tab, the menu or a composer.
function actionByID(id: string): MiniAppAction | Pick<MiniAppAction, 'kind' | 'label' | 'confirm'> | null {
  const value = view.value.value;
  if (!value) return null;
  for (const screen of value.tabs?.map(t => t.view) ?? [value.view]) {
    const found = findAction(screen, id);
    if (found) return found;
    const typed = screen.find((c): c is MiniAppComposer => c.type === 'composer' && c.action === id);
    if (typed) return { kind: typed.remote ? 'remote' : 'state', label: typed.label, confirm: typed.confirm };
  }
  return value.menu?.find(a => a.id === id) ?? null;
}
function press(action: MiniAppAction) {
  menuOpen.value = false;
  if (!app.value) return;
  if (action.kind === 'state' && !action.confirm && action.updates) void apps.tap(app.value, action.id, action.updates);
  else void run(action.id, {});
}
// A composer row that only appends shows at once; anything else waits for the server.
function send(item: MiniAppComposer) {
  const text = draft.value.trim();
  if (!app.value || !text) return;
  const value = item.kind === 'number' ? Number(text) : text.slice(0, 500);
  if (typeof value === 'number' && !Number.isFinite(value)) return;
  const fields = { [item.field]: value };
  draft.value = '';
  if (item.append && !item.confirm && !item.remote) void apps.tap(app.value, item.action, [{ state: item.append.state, op: 'append', value: [{ ...item.append.item, [item.append.key]: value }] }], fields);
  else void run(item.action, fields);
}

async function load(force = false) {
  await apps.refresh(force);
  if (app.value?.status === 'enabled') await apps.resolve(app.value, undefined, force);
}
async function setInput(id: string, value: string) {
  if (!app.value) return;
  await apps.resolve(app.value, { ...view.value.inputs, [id]: value });
}
async function approve(allowed: boolean) {
  if (!app.value || busy.value) return;
  busy.value = true; error.value = null;
  try { await apps.approve(app.value, allowed); if (allowed && app.value) await apps.resolve(app.value, undefined, true); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}
async function remove() {
  menuOpen.value = false;
  if (!app.value || !window.confirm(`Delete ${app.value.title}? The contact can build it again later.`)) return;
  try { await apps.remove(app.value); await navigateTo(props.back, { replace: true }); }
  catch (failure) { error.value = errorMessage(failure); }
}
async function run(actionID: string, fields: Record<string, unknown>) {
  const current = app.value, action = actionByID(actionID);
  if (!current || !action || busyAction.value || (action.confirm && !window.confirm(action.confirm))) return;
  const serialized = JSON.stringify(fields);
  const pending = pendingExecution.value;
  const executionID = pending && pending.actionID === actionID && pending.fields === serialized ? pending.executionID : crypto.randomUUID();
  pendingExecution.value = { actionID, executionID, fields: serialized };
  busyAction.value = actionID; notice.value = null; error.value = null;
  try {
    const status = await apps.run(current, actionID, executionID, fields);
    pendingExecution.value = null;
    // Local state changes show up in the view itself; only external writes report an outcome.
    if (action.kind === 'state') return;
    notice.value = status === 'completed' ? `${action.label}: done.` : status === 'failed' ? `${action.label} failed. Nothing was confirmed by the service.`
      : `${action.label}: the outcome is unknown. Check the service before trying again.`;
  } catch (failure) {
    if (!(failure instanceof ApiError && failure.status === 0)) pendingExecution.value = null;
    error.value = errorMessage(failure);
  } finally { busyAction.value = null; }
}

onMounted(() => load());
</script>

<template>
  <div class="mini-app-screen">
    <PageBar :title="currentTab?.title ?? app?.title ?? 'Mini app'" :back="back" always-back>
      <div v-if="app?.status === 'enabled'" class="mini-menu">
        <button type="button" class="icon-button" aria-label="More" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><AppIcon name="more" /></button>
        <template v-if="menuOpen">
          <div class="backdrop" @click="menuOpen = false" />
          <div class="items" role="menu">
            <button v-for="action in view.value?.menu ?? []" :key="action.id" type="button" role="menuitem" :class="{ danger: action.style === 'destructive' }" :disabled="busyAction === action.id" @click="press(action)">{{ action.label }}</button>
            <hr v-if="view.value?.menu?.length">
            <button type="button" role="menuitem" :disabled="!!view.request" @click="menuOpen = false; load(true)">Refresh</button>
            <button type="button" role="menuitem" :disabled="busy" @click="menuOpen = false; approve(false)">Disable</button>
            <button type="button" role="menuitem" class="danger" @click="remove">Delete mini app</button>
          </div>
        </template>
      </div>
    </PageBar>
    <div class="page">
      <div v-if="!app && !apps.state.value.loaded" class="center"><span class="spinner" /> Loading…</div>
      <div v-else-if="!app" class="empty"><h2>Mini app unavailable</h2><p>{{ apps.state.value.error ?? 'It may have been deleted.' }}</p></div>
      <div v-else class="page-inner">
        <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
        <p v-if="notice" class="group-footer" role="status" style="padding: 0 4px 12px">{{ notice }}</p>

        <template v-if="app.status !== 'enabled'">
          <div class="identity">
            <span class="mini-app-glyph" style="width: 64px; height: 64px; border-radius: 16px"><AppIcon :name="miniAppIcon(app.icon)" /></span>
            <h2>{{ app.title }}</h2>
            <p v-if="app.subtitle" class="muted" style="margin: 0; text-align: center">{{ app.subtitle }}</p>
          </div>
          <p class="group-footer" style="padding: 0 4px 12px">
            {{ app.status === 'needs_reapproval' ? 'A connection or tool changed since you enabled this mini app. Review it again to keep using it.' : 'Your contact built this mini app. Review what it can do before enabling it.' }}
          </p>
          <div class="group-title">Runs each time you open or refresh</div>
          <div class="group">
            <div v-if="!reads.length" class="text-block">No automatic reads.</div>
            <div v-for="tool in reads" :key="`${tool.connectionID}/${tool.toolName}`" class="mini-row"><span class="copy"><strong>{{ tool.toolName }}</strong><span>{{ tool.connectionName }}</span></span></div>
          </div>
          <template v-if="writes.length">
            <div class="group-title">Only when you tap and confirm</div>
            <div class="group">
              <div v-for="tool in writes" :key="`${tool.connectionID}/${tool.toolName}`" class="mini-row"><span class="copy"><strong>{{ tool.toolName }}</strong><span>{{ tool.connectionName }}</span></span></div>
            </div>
          </template>
          <p class="group-footer">These tools use your connection permissions, and the service decides what each one does. Data is loaded for you only; it is not sent to the contact or saved to memory. Editing the mini app requires review again.</p>
          <button type="button" class="button block" :disabled="busy" @click="approve(true)">Enable mini app</button>
          <div class="group" style="margin-top: 20px"><button type="button" class="button-row danger" @click="remove">Delete mini app</button></div>
        </template>

        <template v-else>
          <h2 class="mini-title">{{ currentTab?.title ?? app.title }}</h2>
          <template v-if="firstScreen">
            <template v-for="input in app.inputs" :key="input.id">
              <div v-if="input.type === 'segmented'" class="mini-segmented" role="group" :aria-label="input.label">
                <button v-for="option in input.options" :key="option.value" type="button" :aria-pressed="(view.inputs[input.id] ?? input.default) === option.value" @click="setInput(input.id, option.value)">{{ option.label }}</button>
              </div>
              <div v-else class="group">
                <label class="field mini-field"><span>{{ input.label }}</span><input :type="input.type === 'number' ? 'number' : 'text'" step="any" :inputmode="input.type === 'number' ? 'decimal' : 'text'" :value="view.inputs[input.id] ?? input.default" maxlength="200" @change="setInput(input.id, ($event.target as HTMLInputElement).value)"></label>
              </div>
            </template>
          </template>
          <div v-if="!view.value && view.request" class="center"><span class="spinner" /> Loading data…</div>
          <p v-else-if="view.error" class="notice" style="margin: 0 0 12px">{{ view.error }} <button class="link-button" @click="load(true)">Retry</button></p>
          <MiniAppView v-if="components" :components="components" :busy-action="busyAction" :state="apps.displayState(app.id)" @action="run"
            @tap="(id, updates) => apps.tap(app!, id, updates)" @edit="update => apps.tap(app!, null, [update])" @select-tab="tab => selectedTab = tab" />
          <p v-if="view.value?.remote && firstScreen" class="group-footer" style="padding-top: 4px">Updated {{ messageTime(view.value.resolvedAt) }}</p>
        </template>
      </div>
    </div>
    <form v-if="composer && app?.status === 'enabled'" class="mini-composer" @submit.prevent="send(composer)">
      <input v-model="draft" :type="composer.kind === 'number' ? 'number' : 'text'" step="any" :inputmode="composer.kind === 'number' ? 'decimal' : 'text'" maxlength="500"
        :placeholder="composer.placeholder ?? composer.label" :aria-label="composer.placeholder ?? composer.label" enterkeyhint="send">
      <button type="submit" class="send" :aria-label="composer.label" :disabled="!draft.trim() || busyAction === composer.action"><AppIcon name="send" /></button>
    </form>
    <nav v-if="tabs.length" class="mini-tabs" aria-label="Tabs">
      <button v-for="tab in tabs" :key="tab.id" type="button" :aria-current="tab.id === currentTab?.id ? 'page' : undefined" @click="selectedTab = tab.id">
        <AppIcon :name="miniAppIcon(tab.icon)" />{{ tab.title }}
      </button>
    </nav>
  </div>
</template>
