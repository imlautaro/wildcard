<script setup lang="ts">
const { user, saveName, savePhoto, saveModel, refreshProfile, signOut } = useSession();
const { exporting, progress, exportError, download, cancel } = useDebugExport();
const exportSheet = ref(false);
onBeforeUnmount(cancel);
const busy = ref(false);
const error = ref<string | null>(null);
const models = [
  { value: 'muse-spark-1.3', label: 'Standard', detail: 'Meta does not train on your data.' },
  { value: 'muse-spark-1.3-contributor', label: 'Contributor', detail: 'Meta may train models on what you send.' },
];
const currentModel = computed(() => user.value?.chatModel ?? 'muse-spark-1.3');
const modelSheet = ref(false);
const chatModel = ref(currentModel.value);
const contributorConsent = ref(false);
const modelChanged = computed(() => chatModel.value !== currentModel.value);
const modelInfo = 'Contributor allows Meta to use submitted messages, files, context and responses to train models. Standard does not. Applies to new chat jobs, schedules and group exchanges you start; jobs already started keep their model. Shared data may still use Contributor when you separately consent. MCP chats always use Standard.';
function openModelSheet() {
  chatModel.value = currentModel.value;
  contributorConsent.value = false;
  modelSheet.value = true;
}
const saveChatModel = () => run(async () => {
  await saveModel(chatModel.value, contributorConsent.value);
  modelSheet.value = false;
});
const photoPath = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const rename = (name: string) => run(() => saveName(name));
const changePhoto = (photo: Blob | null) => run(() => savePhoto(photo));
const leave = () => run(signOut);
onMounted(async () => {
  try { await refreshProfile(); }
  catch { /* Retain the session-owned profile through a transient failure. */ }
});
</script>

<template>
  <PageBar title="Account" />
  <div class="page">
    <div class="page-inner">
      <IdentityEditor :name="user?.name ?? ''" :path="photoPath" editable renamable :busy="busy" @photo="changePhoto" @rename="rename" />
      <p class="identity-subtitle account-email">
        <span>{{ user?.email }}</span>
        <InfoButton label="Your profile" text="Group members and people you share contacts with can see your name and photo." />
      </p>
      <p v-if="error && !modelSheet" class="notice" style="margin: 12px 0">{{ error }}</p>

      <div class="group" style="margin-top: 20px">
        <button type="button" class="button-row opens" @click="openModelSheet">
          <AppIcon name="model" />Chat model<span class="row-value">{{ models.find(model => model.value === currentModel)?.label ?? currentModel }}</span>
        </button>
        <NuxtLink class="button-row" to="/account/connections"><AppIcon name="link" />Connections</NuxtLink>
        <NuxtLink class="button-row" to="/native"><AppIcon name="iphone" />Native experiments</NuxtLink>
      </div>
      <div class="group" style="margin-top: 20px">
        <button type="button" class="button-row opens" @click="exportSheet = true"><AppIcon name="file" />Export debug JSON</button>
      </div>
      <div class="group" style="margin-top: 20px">
        <button type="button" class="button-row danger" :disabled="busy" @click="leave"><AppIcon name="logout" />Sign out</button>
      </div>
      <p class="group-footer" style="padding-top: 8px">Scheduled messages and push notifications are available in the iOS app.</p>

      <AppSheet v-if="exportSheet" title="Export debug JSON" @close="cancel(); exportSheet = false">
        <p>Download your private and group chat history, including archived chats, contacts, local memories, reply status, schedules, tasks, documents and mini apps.</p>
        <p class="group-footer">This file contains private text and group participants. Review it before sharing with an AI or anyone else. Credentials, other people's private chats and media files are excluded. Nothing is sent to an AI by this download. Downloads are limited to 100 MB; exports over this limit fail without saving a partial file.</p>
        <p v-if="progress" role="status" aria-live="polite" style="margin-top: 12px">{{ progress }}</p>
        <p v-if="exportError" class="notice" role="alert" style="margin-top: 12px">{{ exportError }}</p>
        <template #actions>
          <button type="button" class="button text" @click="cancel(); exportSheet = false">{{ exporting ? 'Cancel export' : 'Close' }}</button>
          <button type="button" class="button" :disabled="exporting" @click="download">{{ exporting ? 'Exporting…' : 'Download JSON' }}</button>
        </template>
      </AppSheet>

      <AppSheet v-if="modelSheet" title="Chat model" @close="modelSheet = false">
        <template #header><InfoButton label="Chat model" :text="modelInfo" /></template>
        <div class="group" role="radiogroup" aria-label="Chat model">
          <label v-for="model in models" :key="model.value" class="choice-row">
            <input v-model="chatModel" type="radio" name="chat-model" :value="model.value" :disabled="busy" @change="contributorConsent = false">
            <span><strong>Muse Spark 1.3 · {{ model.label }}</strong><span class="small muted">{{ model.detail }}</span></span>
          </label>
          <label v-if="chatModel === 'muse-spark-1.3-contributor' && modelChanged" class="toggle">
            <span>I agree to Meta's Contributor data use</span><input v-model="contributorConsent" type="checkbox" role="switch" :disabled="busy">
          </label>
        </div>
        <p v-if="error" class="notice" style="margin: 12px 0 0">{{ error }}</p>
        <template #actions>
          <button type="button" class="button text" @click="modelSheet = false">Cancel</button>
          <button type="button" class="button" :disabled="busy || !modelChanged || (chatModel === 'muse-spark-1.3-contributor' && !contributorConsent)" @click="saveChatModel">Save</button>
        </template>
      </AppSheet>
    </div>
  </div>
</template>

<style scoped>
.account-email { display: flex; align-items: center; justify-content: center; gap: 4px; overflow-wrap: anywhere; }
</style>
