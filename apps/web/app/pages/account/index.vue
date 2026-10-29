<script setup lang="ts">
useHead({ title: 'Account' });
const { user, saveName, savePhoto, saveModel, refreshProfile, signOut } = useSession();
const name = ref(user.value?.name ?? '');
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
const chatModel = ref(user.value?.chatModel ?? 'muse-spark-1.3');
const contributorConsent = ref(false);
const modelChanged = computed(() => chatModel.value !== (user.value?.chatModel ?? 'muse-spark-1.3'));
const saveChatModel = () => run(async () => {
  await saveModel(chatModel.value, contributorConsent.value);
  contributorConsent.value = false;
  saved.value = true;
});
const photoPath = computed(() => user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null);
const changed = computed(() => name.value.trim() !== user.value?.name);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100);

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  saved.value = false;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const save = () => run(async () => {
  if (!valid.value) return;
  await saveName(name.value.trim());
  name.value = user.value?.name ?? '';
  saved.value = true;
});
const changePhoto = (photo: Blob | null) => run(() => savePhoto(photo));
const leave = () => run(signOut);
onMounted(async () => {
  const initialModel = chatModel.value;
  const initialName = name.value;
  try {
    await refreshProfile();
    if (!busy.value && chatModel.value === initialModel) chatModel.value = user.value?.chatModel ?? 'muse-spark-1.3';
    if (!busy.value && name.value === initialName) name.value = user.value?.name ?? '';
  } catch { /* Retain the session-owned profile through a transient failure. */ }
});
</script>

<template>
  <PageBar title="Account" />
  <div class="page">
    <form class="page-inner" @submit.prevent="save">
      <IdentityEditor :name="user?.name ?? ''" :path="photoPath" editable :busy="busy" @photo="changePhoto" />
      <div class="group">
        <div class="field"><label for="account-name">Name</label><input id="account-name" v-model="name" type="text" maxlength="100"></div>
        <div class="field"><label>Email</label><span class="muted" style="overflow-wrap: anywhere">{{ user?.email }}</span></div>
      </div>
      <p class="group-footer">Group members and people you share contacts with can see your name and photo.</p>
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <p v-if="saved" class="group-footer" role="status">Saved.</p>
      <button type="submit" class="button block" :disabled="!changed || !valid || busy">Save</button>
      <div class="group" style="margin-top: 24px">
        <div class="field"><label for="chat-model">Chat model</label>
          <AppSelect
            id="chat-model" v-model="chatModel" variant="plain" :disabled="busy" @update:model-value="contributorConsent = false"
            :options="[{ value: 'muse-spark-1.3', label: 'Muse Spark 1.3 · Standard' }, { value: 'muse-spark-1.3-contributor', label: 'Muse Spark 1.3 · Contributor' }]"
          />
        </div>
        <label v-if="chatModel === 'muse-spark-1.3-contributor' && modelChanged" class="toggle">
          <span>I agree to Meta's Contributor data use</span><input v-model="contributorConsent" type="checkbox" role="switch" :disabled="busy">
        </label>
      </div>
      <p class="group-footer">Contributor allows Meta to use submitted messages, files, context and responses to train models. Standard does not. Applies to new chat jobs, schedules and group exchanges you start; jobs already started keep their model. Shared data may still use Contributor when you separately consent. MCP chats always use Standard.</p>
      <button type="button" class="button block" :disabled="busy || !modelChanged || (chatModel === 'muse-spark-1.3-contributor' && !contributorConsent)" @click="saveChatModel">Save model</button>
      <div class="group" style="margin-top: 24px">
        <NuxtLink class="button-row" to="/account/connections"><AppIcon name="link" />Connections</NuxtLink>
        <NuxtLink class="button-row" to="/native"><AppIcon name="iphone" />Native experiments</NuxtLink>
      </div>
      <div class="group" style="margin-top: 24px">
        <button type="button" class="button-row danger" :disabled="busy" @click="leave">Sign out</button>
      </div>
      <p class="group-footer" style="padding-top: 16px">
        The web app does not support scheduled messages or push notifications yet. Use the iOS app for those features.
      </p>
    </form>
  </div>
</template>
