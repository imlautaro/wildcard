<script setup lang="ts">
useHead({ title: 'Account' });
const { user, saveName, savePhoto, signOut } = useSession();
const name = ref(user.value?.name ?? '');
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
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
        <button type="button" class="button-row danger" :disabled="busy" @click="leave">Sign out</button>
      </div>
      <p class="group-footer" style="padding-top: 16px">
        The web app does not support voice dictation, scheduled messages, or push notifications yet. Use the iOS app for those features.
      </p>
    </form>
  </div>
</template>
