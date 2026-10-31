<script setup lang="ts">
import { circleTypes } from '../../../../shared/onboarding';
definePageMeta({ layout: false });
const { user, refreshProfile, signOut } = useSession();
const { options, snapshot, draft, busy, refresh, submit } = useOnboarding();
const circleOptions = circleTypes.map(option => ({ value: option.code, label: option.name }));
const error = ref<string | null>(null);
const locked = computed(() => !!snapshot.value?.input);
const running = computed(() => snapshot.value?.status === 'queued' || snapshot.value?.status === 'generating');
const ready = computed(() => !!draft.name.trim() && !!draft.country && draft.sharedMemoryConsent && (locked.value || draft.circleType === 'friends' || !!draft.occupation?.trim()) && (locked.value || (typeof draft.age === 'number' && Number.isInteger(draft.age) && draft.age >= 1 && draft.age <= 120)));
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
    <form class="auth-card onboarding" @submit.prevent="start">
      <p class="eyebrow">Your Wildcard circle</p>
      <h1>Make yourself at home.</h1>
      <p class="lead">Five different personalities. Add a group to bring everyone together if you like.</p>
      <template v-if="options">
        <fieldset :disabled="locked || busy" class="onboarding-fields">
          <div class="pair">
            <AppTextField v-model="draft.name" label="Your name" autocomplete="given-name" maxlength="100" required />
            <!-- Raw field: AppTextField's model is a string and the age is a number. -->
            <label class="text-field"><input v-model.number="draft.age" type="number" min="1" max="120" step="1" placeholder=" " :required="!locked"><span>Your age</span></label>
          </div>
          <div class="pair">
            <AppSelect v-model="draft.gender" label="Gender" :disabled="locked || busy" :options="[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]" />
            <AppSelect v-model="draft.language" label="Preferred language" :disabled="locked || busy" :options="options.languages.map(option => ({ value: option.code, label: option.name }))" />
          </div>
          <AppSelect v-model="draft.country" label="Country" :disabled="locked || busy" :options="options.countries.map(option => ({ value: option.code, label: option.name }))" />
          <AppSelect v-model="draft.style" label="Agent appearance" :disabled="locked || busy" :options="options.styles.map(option => ({ value: option.code, label: option.name }))" />
          <AppSelect v-model="draft.circleType" label="Your circle" :disabled="locked || busy" :options="circleOptions" />
          <AppTextField v-if="draft.circleType !== 'friends'" v-model="draft.occupation" :label="draft.circleType === 'study' ? 'What are you studying?' : 'What do you do for work?'"
                        maxlength="200" :required="!locked" />
          <label class="check-row"><input v-model="draft.createGroup" type="checkbox"><span>Create a group with my five contacts</span></label>
        </fieldset>
        <p class="hint info-title">About your contacts <InfoButton label="About your contacts" text="Your contacts will have names common in your country and speak your preferred language. Contacts in every style are adults, usually within two years of your age, with a minimum age of 18. Gender does not determine your contacts’ personalities. Friends have varied interests. Study and work teams use your field to create complementary contacts." /></p>
        <AppListGroup class="consent">
          <label class="check-row">
            <input v-model="draft.sharedMemoryConsent" type="checkbox" :disabled="locked || busy">
            <span>I agree to enable shared memory for my five AI contacts. If I create a group, its members can read the full group history. Facts shared in private or group chats may become shared memories recalled by these contacts in other chats; private transcripts remain access controlled. Setup uses Meta Standard processing.</span>
          </label>
        </AppListGroup>
        <div v-if="running" role="status" aria-live="polite" class="progress">
          <span class="spinner" />
          <div>
            <strong>{{ snapshot?.status === 'queued' ? 'Preparing your circle…' : `Creating your circle… ${snapshot?.photoCount ?? 0} of 5 portraits ready.` }}</strong>
            <p>You can close the app. Your circle will keep taking shape.</p>
          </div>
        </div>
        <AppNotice v-if="snapshot?.status === 'failed'">We could not finish your circle. Retry to continue with your saved preferences and portraits.</AppNotice>
        <AppButton v-if="!running && snapshot?.status !== 'complete'" type="submit" block :disabled="!ready || busy">
          {{ busy ? 'Saving…' : locked ? 'Retry setup' : 'Create my circle' }}
        </AppButton>
      </template>
      <AppLoading v-else label="Loading your preferences…" />
      <AppNotice v-if="error" class="refresh-error">
        {{ error }}
        <template #actions><button type="button" class="link-button" @click="update">Refresh</button></template>
      </AppNotice>
      <AppButton variant="text" block class="sign-out" @click="signOut">Sign out</AppButton>
    </form>
  </main>
</template>

<style scoped>
.auth-card { max-width: 560px; }
.eyebrow { margin: 0 0 var(--space-2); text-align: center; font: var(--type-label-medium); font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--md-primary); }
.onboarding-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--space-3); }
@media (max-width: 480px) { .pair { grid-template-columns: 1fr; } }
.hint { margin: calc(-1 * var(--space-1)) var(--space-1) var(--space-4); font-size: 13px; color: var(--md-on-surface-variant); }
.onboarding :deep(.consent) { margin-bottom: var(--space-4); }
.progress { display: flex; align-items: flex-start; gap: var(--space-3); margin: 0 0 var(--space-4); padding: var(--space-4); border-radius: var(--md-shape-m); background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.progress p { margin: var(--space-1) 0 0; font: var(--type-body-medium); }
.refresh-error { margin: var(--space-4) 0 0; }
.sign-out { margin-top: var(--space-2); }
</style>
