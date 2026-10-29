<script setup lang="ts">
useHead({ title: 'Flags' });
const { settings, errors, loadSettings, saveSetting } = useAdmin();
const saving = ref<string | null>(null);
const failure = ref<string | null>(null);
onMounted(loadSettings);

async function toggle(key: string, input: HTMLInputElement) {
  if (saving.value) return;
  saving.value = key;
  failure.value = null;
  try { await saveSetting(key, input.checked); }
  catch (error) {
    // The bound value didn't change, so Vue won't reset the switch by itself.
    input.checked = !input.checked;
    failure.value = errorMessage(error);
  } finally { saving.value = null; }
}
</script>

<template>
  <div class="page">
    <header class="bar"><h1 class="title">Flags</h1></header>
    <div class="page-inner">
      <p v-if="failure ?? errors.settings" class="notice" role="alert">{{ failure ?? errors.settings }}</p>
      <div v-if="!settings && !errors.settings" class="center"><span class="spinner" /> Loading…</div>
      <template v-if="settings">
        <div class="group">
          <label v-for="setting in settings" :key="setting.key" class="toggle">
            <span class="two-line">
              <span>{{ setting.label }}</span>
              <span class="small">{{ setting.description }}</span>
              <span class="small code-key">{{ setting.key }}<template v-if="setting.updatedAt"> · changed {{ formatDateTime(setting.updatedAt) }}</template></span>
            </span>
            <span v-if="saving === setting.key" class="spinner" />
            <input type="checkbox" role="switch" :checked="setting.value" :disabled="saving !== null"
                   @change="toggle(setting.key, $event.target as HTMLInputElement)">
          </label>
        </div>
        <p class="group-footer">Changes apply to the API on the next request, without a release. New flags are declared in <code>apps/api/src/admin/settings.ts</code>.</p>
      </template>
    </div>
  </div>
</template>
