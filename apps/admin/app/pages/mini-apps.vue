<script setup lang="ts">
import type { LabResult } from '~/utils/types';

// Mini app lab: imports a generated bundle ({ apps: [{ title, spec }] }) into one of
// your own chats, where the apps show in Contact → Mini apps on iOS and web.
useHead({ title: 'Mini app lab' });
const { labContacts, errors, loadLabContacts, importLabApps } = useAdmin();
const contactID = ref('');
const bundle = ref('');
const fileName = ref<string | null>(null);
const replace = ref(true);
const importing = ref(false);
const failure = ref<string | null>(null);
const results = ref<LabResult[] | null>(null);
onMounted(loadLabContacts);

const options = computed(() => (labContacts.value ?? []).map((contact) => ({
  value: contact.id,
  label: `${contact.name} · ${contact.miniApps} app${contact.miniApps === 1 ? '' : 's'}${contact.labApps ? ` (${contact.labApps} lab)` : ''}`,
})));

async function pickFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  fileName.value = file.name;
  bundle.value = await file.text();
}

function parseBundle(): unknown[] | string {
  let value: unknown;
  try { value = JSON.parse(bundle.value); } catch { return 'The bundle is not valid JSON.'; }
  const apps = Array.isArray(value) ? value : (value as { apps?: unknown } | null)?.apps;
  if (!Array.isArray(apps) || !apps.length) return 'The bundle needs an "apps" array of { title, spec }.';
  if (apps.length > 20) return `The bundle has ${apps.length} apps; a chat holds at most 20. Split it across two contacts.`;
  return apps;
}

async function submit() {
  if (importing.value || !contactID.value) return;
  const apps = parseBundle();
  failure.value = null;
  if (typeof apps === 'string') { failure.value = apps; return; }
  importing.value = true;
  results.value = null;
  try { results.value = await importLabApps(contactID.value, apps, replace.value); }
  catch (error) { failure.value = errorMessage(error); }
  finally { importing.value = false; }
}

const imported = computed(() => results.value?.filter((result) => result.ok).length ?? 0);
</script>

<template>
  <div class="page">
    <AppTopBar title="Mini app lab" contained>
      <AppIconButton icon="refresh" label="Refresh contacts" @click="loadLabContacts()" />
    </AppTopBar>
    <div class="page-inner">
      <p class="group-footer">
        Imports generated mini apps into one of your own chats so you can try them on a device from
        Contact → Mini apps. Apps are verified like <code>create_mini_app</code>, must be state-only, and a chat holds at most 20.
      </p>
      <AppNotice v-if="errors.lab">{{ errors.lab }}</AppNotice>
      <AppLoading v-if="!labContacts && !errors.lab" fill />
      <AppEmptyState v-else-if="labContacts && !labContacts.length" icon="people" title="No contacts"
                     text="Create a contact in the app first; lab apps are added to its private chat." />
      <form v-else-if="labContacts" class="lab-form" @submit.prevent="submit">
        <AppSelect v-model="contactID" :options="options" label="Contact" placeholder="Choose one of your contacts" />
        <label class="file-pick">
          <input type="file" accept="application/json,.json" @change="pickFile">
          <span>{{ fileName ? `Loaded ${fileName}` : 'Choose a bundle file…' }}</span>
        </label>
        <AppTextField v-model="bundle" label="Bundle JSON" multiline rows="6" spellcheck="false"
                      supporting='{"apps":[{"title":"01 · Truco","spec":{…}}]}' />
        <label class="check">
          <input v-model="replace" type="checkbox">
          <span>Replace previous lab apps in this chat</span>
        </label>
        <AppNotice v-if="failure">{{ failure }}</AppNotice>
        <div>
          <AppButton type="submit" icon="grid" :loading="importing" :disabled="!contactID || !bundle.trim()">Import</AppButton>
        </div>
      </form>
      <template v-if="results">
        <AppNotice :tone="imported === results.length ? 'success' : 'warning'">
          Imported {{ imported }} of {{ results.length }}.
        </AppNotice>
        <AppListGroup>
          <AppListItem v-for="(result, index) in results" :key="index" plain :icon="result.ok ? 'check' : 'error'"
                       :supporting="result.ok ? 'Ready in Contact → Mini apps' : result.problems?.join(' · ')">
            {{ result.title }}
          </AppListItem>
        </AppListGroup>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lab-form { display: flex; flex-direction: column; gap: var(--space-4); }
.file-pick { display: flex; align-items: center; gap: var(--space-3); font: var(--type-body-medium); }
.file-pick input { max-width: 100%; }
.check { display: flex; align-items: center; gap: var(--space-2); font: var(--type-body-medium); }
</style>
