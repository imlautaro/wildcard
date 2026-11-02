<script setup lang="ts">
import type { MiniAppAction, MiniAppComponent, MiniAppComposer, MiniAppItem, MiniAppRowTarget } from '~/utils/types';

// A mini app opens as its own screen: a top bar with the app's menu, the current tab,
// an optional composer pinned to the bottom and a tab bar for tabbed apps. Toolbar
// buttons of the current screen sit in the top bar; forms open in a sheet.
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
// The open form: an action with fields, optionally for one row (prefilled with its values).
const sheet = ref<{ action: MiniAppAction; row?: MiniAppRowTarget; values?: MiniAppItem } | null>(null);
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
const toolbar = computed(() => components.value?.flatMap(c => c.type === 'toolbar' ? [c] : []) ?? []);
// Row controls wait while taps are unconfirmed: their row indexes come from the server's view.
const pending = computed(() => (app.value ? apps.view(app.value.id).taps.length > 0 : false));
const firstScreen = computed(() => !currentTab.value || currentTab.value.id === tabs.value[0]?.id);
const { t } = useI18n();

const reads = computed(() => app.value?.tools.filter(t => t.role === 'read') ?? []);
const writes = computed(() => app.value?.tools.filter(t => t.role === 'write') ?? []);
function findAction(components: MiniAppComponent[], id: string): MiniAppAction | null {
  for (const item of components) {
    if (item.type === 'action' && item.id === id) return item;
    if ((item.type === 'tile' || item.type === 'toolbar') && item.action?.id === id) return item.action;
    if (item.type === 'list' || item.type === 'checklist') { const found = [item.edit, ...(item.actions ?? [])].find(a => a?.id === id); if (found) return found; }
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
  if (action.fields.length) { error.value = null; sheet.value = { action }; }
  else if (action.kind === 'state' && !action.confirm && action.updates) void apps.tap(app.value, action.id, action.updates);
  else void run(action.id, {});
}
// A submitted sheet closes (and clears) only when the action went through.
async function submitSheet(fields: Record<string, unknown>) {
  const open = sheet.value;
  if (!open) return;
  if (await run(open.action.id, fields, open.row)) sheet.value = null;
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
  if (!app.value || !window.confirm(t('miniapps.screen.deleteConfirm', { title: app.value.title }))) return;
  try { await apps.remove(app.value); await navigateTo(props.back, { replace: true }); }
  catch (failure) { error.value = errorMessage(failure); }
}
async function run(actionID: string, fields: Record<string, unknown>, row?: MiniAppRowTarget): Promise<boolean> {
  const current = app.value, action = actionByID(actionID);
  if (!current || !action || busyAction.value || (action.confirm && !window.confirm(action.confirm))) return false;
  const serialized = JSON.stringify({ fields, row });
  const pending = pendingExecution.value;
  const executionID = pending && pending.actionID === actionID && pending.fields === serialized ? pending.executionID : crypto.randomUUID();
  pendingExecution.value = { actionID, executionID, fields: serialized };
  busyAction.value = actionID; notice.value = null; error.value = null;
  try {
    const status = await apps.run(current, actionID, executionID, fields, row);
    pendingExecution.value = null;
    // Local state changes show up in the view itself; only external writes report an outcome.
    if (action.kind === 'state') return true;
    notice.value = t(status === 'completed' ? 'miniapps.screen.actionDone' : status === 'failed' ? 'miniapps.screen.actionFailed' : 'miniapps.screen.actionUnknown', { label: action.label });
    return true;
  } catch (failure) {
    if (!(failure instanceof ApiError && failure.status === 0)) pendingExecution.value = null;
    error.value = errorMessage(failure);
    return false;
  } finally { busyAction.value = null; }
}
// On touch screens, tapping outside the composer closes the keyboard.
const composerInput = ref<HTMLInputElement>();
function blurComposer(event: PointerEvent) {
  if (event.pointerType === 'touch' && document.activeElement === composerInput.value && !(event.target as HTMLElement).closest('.mini-composer')) composerInput.value?.blur();
}

onMounted(() => load());
</script>

<template>
  <div class="mini-app-screen">
    <PageBar :title="currentTab?.title ?? app?.title ?? $t('miniapps.screen.fallbackTitle')" :back="back" always-back>
      <template v-if="app?.status === 'enabled'">
        <template v-for="item in toolbar" :key="item.action.id">
          <AppIconButton v-if="item.icon === 'plus'" icon="plus" :label="item.action.label" :disabled="busyAction === item.action.id" @click="press(item.action)" />
          <AppButton v-else variant="text" :disabled="busyAction === item.action.id" @click="press(item.action)">{{ item.action.label }}</AppButton>
        </template>
      </template>
      <div v-if="app?.status === 'enabled'" class="mini-menu">
        <AppIconButton icon="more" :label="$t('common.more')" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen" />
        <template v-if="menuOpen">
          <div class="backdrop" @click="menuOpen = false" />
          <div class="menu" role="menu">
            <AppMenuItem v-for="action in view.value?.menu ?? []" :key="action.id" role="menuitem" :danger="action.style === 'destructive'" :disabled="busyAction === action.id" @click="press(action)">{{ action.label }}</AppMenuItem>
            <hr v-if="view.value?.menu?.length" class="menu-divider">
            <AppMenuItem role="menuitem" :disabled="!!view.request" @click="menuOpen = false; load(true)">{{ $t('miniapps.screen.refresh') }}</AppMenuItem>
            <AppMenuItem role="menuitem" :disabled="busy" @click="menuOpen = false; approve(false)">{{ $t('miniapps.screen.disable') }}</AppMenuItem>
            <AppMenuItem role="menuitem" danger @click="remove">{{ $t('miniapps.screen.delete') }}</AppMenuItem>
          </div>
        </template>
      </div>
    </PageBar>
    <div class="page" @pointerdown="blurComposer">
      <AppLoading v-if="!app && !apps.state.value.loaded" fill />
      <AppEmptyState v-else-if="!app" icon="grid" :title="$t('miniapps.screen.unavailableTitle')" :text="apps.state.value.error ?? $t('miniapps.screen.unavailableText')" />
      <div v-else class="page-inner">
        <AppNotice v-if="error">{{ error }}</AppNotice>
        <AppNotice v-if="notice" tone="info">{{ notice }}</AppNotice>

        <template v-if="app.status !== 'enabled'">
          <div class="identity">
            <span class="mini-app-glyph review-glyph"><AppIcon :name="miniAppIcon(app.icon)" /></span>
            <h2>{{ app.title }}</h2>
            <p v-if="app.subtitle" class="identity-subtitle">{{ app.subtitle }}</p>
          </div>
          <AppNotice :tone="app.status === 'needs_reapproval' ? 'warning' : 'info'">
            {{ app.status === 'needs_reapproval' ? $t('miniapps.screen.needsReapproval') : $t('miniapps.screen.needsReview') }}
          </AppNotice>
          <AppListGroup :title="$t('miniapps.screen.reads')" :footer="writes.length ? undefined : $t('miniapps.screen.permissionNote')">
            <div v-if="!reads.length" class="text-block">{{ $t('miniapps.screen.noReads') }}</div>
            <div v-for="tool in reads" :key="`${tool.connectionID}/${tool.toolName}`" class="mini-row"><span class="copy"><strong>{{ tool.toolName }}</strong><span>{{ tool.connectionName }}</span></span></div>
          </AppListGroup>
          <AppListGroup v-if="writes.length" :title="$t('miniapps.screen.writes')" :footer="$t('miniapps.screen.permissionNote')">
            <div v-for="tool in writes" :key="`${tool.connectionID}/${tool.toolName}`" class="mini-row"><span class="copy"><strong>{{ tool.toolName }}</strong><span>{{ tool.connectionName }}</span></span></div>
          </AppListGroup>
          <AppButton block class="enable-button" :disabled="busy" @click="approve(true)">{{ $t('miniapps.screen.enable') }}</AppButton>
          <AppListGroup><AppListItem danger @click="remove">{{ $t('miniapps.screen.delete') }}</AppListItem></AppListGroup>
        </template>

        <template v-else>
          <h2 class="mini-title">{{ currentTab?.title ?? app.title }}</h2>
          <template v-if="firstScreen">
            <template v-for="input in app.inputs" :key="input.id">
              <div v-if="input.type === 'segmented'" class="segmented mini-segmented" role="group" :aria-label="input.label">
                <button v-for="option in input.options" :key="option.value" type="button" :aria-pressed="(view.inputs[input.id] ?? input.default) === option.value" @click="setInput(input.id, option.value)">{{ option.label }}</button>
              </div>
              <div v-else class="group">
                <label class="field mini-field"><span>{{ input.label }}</span><input :type="input.type === 'number' ? 'number' : 'text'" step="any" :inputmode="input.type === 'number' ? 'decimal' : 'text'" :value="view.inputs[input.id] ?? input.default" maxlength="200" @change="setInput(input.id, ($event.target as HTMLInputElement).value)"></label>
              </div>
            </template>
          </template>
          <AppLoading v-if="!view.value && view.request" :label="$t('miniapps.screen.loadingData')" />
          <AppNotice v-else-if="view.error" :tone="view.value ? 'warning' : 'error'">
            {{ view.error }}
            <template #actions><button class="link-button" @click="load(true)">{{ $t('common.retry') }}</button></template>
          </AppNotice>
          <MiniAppView v-if="components" :components="components" :busy-action="busyAction" :state="apps.displayState(app.id)" :pending="pending" @action="(id, fields) => run(id, fields)"
            @tap="(id, updates) => apps.tap(app!, id, updates)" @edit="update => apps.tap(app!, null, [update])" @select-tab="tab => selectedTab = tab"
            @open="(action, row, values) => { error = null; sheet = { action, row, values } }" @row-action="(action, row) => run(action.id, {}, row)" />
          <p v-if="view.value?.remote && firstScreen" class="group-footer">{{ $t('miniapps.screen.updated', { time: messageTime(view.value.resolvedAt) }) }}</p>
        </template>
      </div>
    </div>
    <form v-if="composer && app?.status === 'enabled'" class="mini-composer" @submit.prevent="send(composer)">
      <input ref="composerInput" v-model="draft" :type="composer.kind === 'number' ? 'number' : 'text'" step="any" :inputmode="composer.kind === 'number' ? 'decimal' : 'text'" maxlength="500"
        :placeholder="composer.placeholder ?? composer.label" :aria-label="composer.placeholder ?? composer.label" enterkeyhint="send">
      <button type="submit" class="send" data-ripple :aria-label="composer.label" :disabled="!draft.trim() || busyAction === composer.action"><AppIcon name="send" /></button>
    </form>
    <MiniAppForm v-if="sheet" :key="`${sheet.action.id}:${sheet.row?.index ?? ''}`" :action="sheet.action" :values="sheet.values" :busy="busyAction === sheet.action.id" :error="error" @submit="submitSheet" @close="sheet = null" />
    <nav v-if="tabs.length" class="mini-tabs" :aria-label="$t('miniapps.screen.tabs')">
      <button v-for="tab in tabs" :key="tab.id" type="button" :aria-current="tab.id === currentTab?.id ? 'page' : undefined" @click="selectedTab = tab.id">
        <AppIcon :name="miniAppIcon(tab.icon)" />{{ tab.title }}
      </button>
    </nav>
  </div>
</template>

<style scoped>
/* The layer's .menu surface, anchored under the More button above the backdrop. */
.mini-menu .menu { position: absolute; right: 0; top: 44px; z-index: 6; min-width: 224px; transform-origin: top right; }
.review-glyph { width: 64px; height: 64px; border-radius: var(--md-shape-l); }
/* AppListGroup renders a fragment, so the space before the Delete group sits on the button. */
.enable-button { margin-bottom: var(--space-5); }
</style>
