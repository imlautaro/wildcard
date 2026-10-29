<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Meet your circle · Wildcard' });
const { user, refreshProfile, signOut } = useSession();
const { options, snapshot, draft, busy, refresh, submit } = useOnboarding();
const error = ref<string | null>(null);
const locked = computed(() => !!snapshot.value?.input);
const running = computed(() => snapshot.value?.status === 'queued' || snapshot.value?.status === 'generating');
const ready = computed(() => !!draft.name.trim() && !!draft.country && draft.sharedMemoryConsent && (locked.value || (typeof draft.age === 'number' && Number.isInteger(draft.age) && draft.age >= 1 && draft.age <= 120)));
let disposed = false;
let updating = false;
let timer: ReturnType<typeof setTimeout> | undefined;
async function update() {
  if (updating || disposed) return;
  if (timer) clearTimeout(timer);
  updating = true;
  try {
    await refresh();
    if (disposed) return;
    error.value = null;
    if (snapshot.value?.status === 'complete') {
      await refreshProfile();
      if (!disposed && !user.value?.onboardingRequired) await navigateTo('/');
    }
  } catch (failure) { if (!disposed) error.value = errorMessage(failure); }
  finally { updating = false; if (!disposed) timer = setTimeout(update, running.value ? 3000 : 10000); }
}
async function start() {
  error.value = null;
  try { await submit(); }
  catch (failure) { error.value = errorMessage(failure); }
}
onMounted(() => {
  if (!draft.name && user.value?.name !== 'New member') draft.name = user.value?.name ?? '';
  void update();
});
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer); });
</script>

<template>
  <main class="auth">
    <form class="auth-card" @submit.prevent="start">
      <p class="eyebrow">YOUR WILDCARD CIRCLE</p>
      <h1>Make yourself at home.</h1>
      <p class="lead">Five different personalities. One group to bring everyone together.</p>
      <template v-if="options">
        <fieldset :disabled="locked || busy" style="border: 0; padding: 0; margin: 24px 0" class="group">
          <label class="field">Your name <input v-model="draft.name" autocomplete="given-name" maxlength="100" required></label>
          <label class="field">Your age <input v-model.number="draft.age" type="number" min="1" max="120" step="1" placeholder="Age in years" :required="!locked"></label>
          <label class="field">Gender
            <select v-model="draft.gender"><option value="male">Male</option><option value="female">Female</option></select>
          </label>
          <label class="field">Preferred language
            <select v-model="draft.language"><option v-for="option in options.languages" :key="option.code" :value="option.code">{{ option.name }}</option></select>
          </label>
          <label class="field">Country
            <select v-model="draft.country" required><option disabled value="">Choose your country</option><option v-for="option in options.countries" :key="option.code" :value="option.code">{{ option.name }}</option></select>
          </label>
          <label class="field">Agent appearance
            <select v-model="draft.style"><option v-for="option in options.styles" :key="option.code" :value="option.code">{{ option.name }}</option></select>
          </label>
        </fieldset>
        <p class="group-footer">Your contacts will have names common in your country and speak your preferred language. Realistic contacts will be within two years of your age. Gender does not determine your contacts’ personalities.</p>
        <label style="display: flex; align-items: start; gap: 10px; margin: 20px 0">
          <input v-model="draft.sharedMemoryConsent" type="checkbox" :disabled="locked || busy">
          <span>I agree to create a group with my five AI contacts and enable shared memory for them. Group members can read the full group history. Facts shared in private or group chats may become shared memories recalled by these contacts in other chats; private transcripts remain access controlled. Setup uses Meta Standard processing.</span>
        </label>
        <div v-if="running" role="status" aria-live="polite" style="margin: 20px 0">
          <span class="spinner" /> {{ snapshot?.status === 'queued' ? 'Preparing your circle…' : `Creating your circle… ${snapshot?.photoCount ?? 0} of 5 portraits ready.` }}
          <p>You can close the app. Your circle will keep taking shape.</p>
        </div>
        <p v-if="snapshot?.status === 'failed'" role="alert" class="notice">We could not finish your circle. Retry to continue with your saved preferences and portraits.</p>
        <button v-if="!running && snapshot?.status !== 'complete'" type="submit" class="button block" :disabled="!ready || busy">
          {{ busy ? 'Saving…' : locked ? 'Retry setup' : 'Create my circle' }}
        </button>
      </template>
      <p v-else role="status">Loading your preferences…</p>
      <p v-if="error" class="notice" role="alert">{{ error }} <button type="button" @click="update">Refresh</button></p>
      <button type="button" class="button block" style="margin-top: 20px" @click="signOut">Sign out</button>
    </form>
  </main>
</template>

<style scoped>
.auth-card { max-width: 520px; }
.field { display: flex; align-items: center; gap: 16px; }
.field input, .field select { min-width: 0; flex: 1; width: 100%; font: inherit; color: inherit; background: transparent; border: 0; padding: 12px 0; }
.eyebrow { font-size: 12px; letter-spacing: .15em; }
</style>
