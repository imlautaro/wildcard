<script setup lang="ts">
useHead({ title: 'Flags' });
const { settings, errors, loadSettings, saveSetting } = useAdmin();
const saving = ref<string | null>(null);
const failure = ref<string | null>(null);
onMounted(loadSettings);

async function toggle(key: string, event: Event) {
  const input = event.target as HTMLInputElement;
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
    <AppTopBar title="Flags" contained />
    <div class="page-inner">
      <AppNotice v-if="failure ?? errors.settings">{{ failure ?? errors.settings }}</AppNotice>
      <AppLoading v-if="!settings && !errors.settings" fill />
      <AppListGroup v-if="settings">
        <AppSwitch v-for="setting in settings" :key="setting.key" :checked="setting.value" :disabled="saving !== null"
                   :busy="saving === setting.key" @change="toggle(setting.key, $event)">
          {{ setting.label }}
          <template #supporting>
            {{ setting.description }}
            <span class="code-key">{{ setting.key }}<template v-if="setting.updatedAt"> · changed {{ formatDateTime(setting.updatedAt) }}</template></span>
          </template>
        </AppSwitch>
        <template #footer>Changes apply to the API on the next request, without a release. New flags are declared in <code>apps/api/src/admin/settings.ts</code>.</template>
      </AppListGroup>
    </div>
  </div>
</template>
