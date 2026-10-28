<script setup lang="ts">
import type { MiniAppComponent } from '~/utils/types';

const route = useRoute();
const contactID = computed(() => String(route.params.id));
const appID = computed(() => String(route.params.appID));
const apps = useMiniApps(contactID);
const app = computed(() => apps.state.value.apps.find(item => item.id === appID.value) ?? null);
const view = computed(() => apps.view(appID.value));
const busy = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busyAction = ref<string | null>(null);
// An uncertain submission keeps its execution ID so a retry can never run twice.
const pendingExecution = ref<{ actionID: string; executionID: string; fields: string } | null>(null);
useHead({ title: computed(() => app.value?.title ?? 'Mini app') });

const reads = computed(() => app.value?.tools.filter(t => t.role === 'read') ?? []);
const writes = computed(() => app.value?.tools.filter(t => t.role === 'write') ?? []);
function findAction(components: MiniAppComponent[], id: string): Extract<MiniAppComponent, { type: 'action' }> | null {
  for (const item of components) {
    if (item.type === 'action' && item.id === id) return item;
    if (item.type === 'section') { const found = findAction(item.children, id); if (found) return found; }
  }
  return null;
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
  if (!app.value || !window.confirm(`Delete ${app.value.title}? The contact can build it again later.`)) return;
  try { await apps.remove(app.value); await navigateTo(`/chats/${contactID.value}`, { replace: true }); }
  catch (failure) { error.value = errorMessage(failure); }
}
async function run(actionID: string, fields: Record<string, unknown>) {
  const current = app.value, action = view.value.value && findAction(view.value.value.view, actionID);
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
  <PageBar :title="app?.title ?? 'Mini app'" :back="`/chats/${contactID}`" always-back>
    <button v-if="app?.status === 'enabled'" type="button" class="icon-button" aria-label="Refresh" :disabled="!!view.request" @click="load(true)"><AppIcon name="refresh" /></button>
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
      </template>

      <template v-else>
        <template v-for="input in app.inputs" :key="input.id">
          <div v-if="input.type === 'segmented'" class="mini-segmented" role="group" :aria-label="input.label">
            <button v-for="option in input.options" :key="option.value" type="button" :aria-pressed="(view.inputs[input.id] ?? input.default) === option.value" @click="setInput(input.id, option.value)">{{ option.label }}</button>
          </div>
          <div v-else class="group">
            <label class="field mini-field"><span>{{ input.label }}</span><input type="text" :value="view.inputs[input.id] ?? input.default" maxlength="200" @change="setInput(input.id, ($event.target as HTMLInputElement).value)"></label>
          </div>
        </template>
        <div v-if="!view.value && view.request" class="center"><span class="spinner" /> Loading data…</div>
        <p v-else-if="view.error" class="notice" style="margin: 0 0 12px">{{ view.error }} <button class="link-button" @click="load(true)">Retry</button></p>
        <MiniAppView v-if="view.value" :components="view.value.view" :busy-action="busyAction" @action="run" />
        <p v-if="view.value" class="group-footer" style="padding-top: 4px">Updated {{ messageTime(view.value.resolvedAt) }}</p>
      </template>

      <div class="group" style="margin-top: 20px">
        <button v-if="app.status === 'enabled'" type="button" class="button-row" :disabled="busy" @click="approve(false)">Disable</button>
        <button type="button" class="button-row danger" @click="remove">Delete mini app</button>
      </div>
    </div>
  </div>
</template>
