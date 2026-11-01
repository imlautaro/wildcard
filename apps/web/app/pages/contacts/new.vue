<script setup lang="ts">
import type { Contact } from '~/utils/types';
import { customStyleLimit } from '../../../../../shared/onboarding';

const chats = useChats();
const mode = ref('manual');
const generation = useContactGeneration();
const { draft, job, options } = generation;
const running = computed(() => ['queued', 'generating'].includes(job.value?.status ?? ''));
const creating = computed(() => generation.busy.value || running.value);
const progressMessages = [
  'A unique name, personality, and portrait are on the way.',
  'Your contact is being created with the preferences you chose.',
  'This can take a few minutes. We are still working on your contact.',
];
const progressIndex = ref(0);
watch(creating, (active, _, onCleanup) => {
  progressIndex.value = 0;
  if (!active) return;
  mode.value = 'ai';
  const rotation = setInterval(() => { progressIndex.value = (progressIndex.value + 1) % progressMessages.length; }, 5000);
  onCleanup(() => clearInterval(rotation));
}, { immediate: true });
const ready = computed(() => !!draft.country && Number.isInteger(draft.age) && draft.age >= 18 && draft.age <= 120 && (draft.style !== 'custom' || !!draft.customStyle?.trim()));
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
async function poll() {
  await generation.refresh();
  if (!disposed) timer = setTimeout(poll, running.value ? 3000 : 10000);
}
onMounted(() => { void poll(); });
// A completed generation opens the new contact's chat, like manual creation.
watch(generation.created, async (id) => {
  if (!id) return;
  generation.created.value = null;
  try {
    const { contact } = await api<{ contact: Contact }>(`contacts/${id}`);
    chats.upsertContact(contact);
  } catch { /* The chat page loads the contact itself. */ }
  await navigateTo(`/chats/${id}`, { replace: true });
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer); });
const name = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100);

async function create() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { contact } = await api<{ contact: Contact }>('contacts', { json: { name: name.value.trim() } });
    chats.upsertContact({ ...contact, lastMessageAt: null, lastMessageText: null });
    await navigateTo(`/chats/${contact.id}`, { replace: true });
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PageBar title="New Contact" back="/contacts" always-back />
  <div class="page">
    <div class="page-inner">
      <AppSelect v-model="mode" label="Create contact" :disabled="creating" :options="[{ value: 'manual', label: 'Manually' }, { value: 'ai', label: 'Generate with AI' }]" />
      <form v-if="mode === 'manual'" @submit.prevent="create">
        <IdentityEditor :name="name || '?'" :path="null" />
        <AppListGroup>
          <div class="field"><input v-model="name" type="text" placeholder="Name" aria-label="Name" maxlength="100" autofocus></div>
        </AppListGroup>
        <AppNotice v-if="error">{{ error }}</AppNotice>
        <AppButton type="submit" block :disabled="!valid || busy">Create Contact</AppButton>
      </form>
      <form v-else @submit.prevent="generation.submit">
        <section v-if="creating" class="generation-progress" aria-labelledby="generation-title">
          <span class="spinner generation-spinner" aria-hidden="true" />
          <h2 id="generation-title">{{ running ? 'Creating your contact…' : 'Starting contact creation…' }}</h2>
          <p class="generation-message" role="status" aria-live="polite" aria-atomic="true">{{ running ? progressMessages[progressIndex] : 'Sending your request…' }}</p>
          <p v-if="running" class="muted">You can leave this screen or close the app. Creation will continue in the background.</p>
        </section>
        <template v-else>
          <!-- Outlined selects follow, not a list group, so the title stays markup. -->
          <div class="group-title info-title">Your bot <InfoButton label="Your bot" text="These fields describe your bot. Your saved onboarding preferences are reused without asking for your details again. Generation uses Meta Standard processing." /></div>
          <fieldset v-if="options" class="bot-fields" :disabled="generation.busy.value || !!job">
            <AppSelect v-model="draft.style" label="Visual style" :options="options.styles.map(o => ({ value: o.code, label: o.name }))" />
            <AppTextField v-if="draft.style === 'custom'" v-model="draft.customStyle" label="Describe your character" placeholder="A friendly robot, a kitten…"
                          :maxlength="customStyleLimit" required />
            <AppSelect v-model="draft.purpose" label="Relationship" :options="[{ value: 'friends', label: 'Friend' }, { value: 'study', label: 'Study partner' }, { value: 'work', label: 'Work colleague' }]" />
            <label class="field">Age<input v-model.number="draft.age" type="number" min="18" max="120" step="1" required></label>
            <AppSelect v-model="draft.gender" label="Gender" :options="[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]" />
            <AppSelect v-model="draft.language" label="Preferred language" :options="options.languages.map(o => ({ value: o.code, label: o.name }))" />
            <AppSelect v-model="draft.country" label="Country" :options="options.countries.map(o => ({ value: o.code, label: o.name }))" />
          </fieldset>
          <AppLoading v-else label="Loading options…" />
        </template>
        <AppNotice v-if="job?.status === 'failed' && !creating">Could not finish creating the contact. Create again to reuse the saved identity and portrait.</AppNotice>
        <AppNotice v-if="generation.error.value">
          {{ generation.error.value }}
          <template #actions><button type="button" class="link-button" @click="generation.refresh">Refresh</button></template>
        </AppNotice>
        <AppButton type="submit" block :disabled="!ready || generation.busy.value || running">{{ creating ? 'Creating…' : 'Create Contact' }}</AppButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
.bot-fields { border: 0; padding: 0; }
.generation-progress {
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  margin: 24px 0; padding: 40px 24px; text-align: center;
  background: var(--md-surface-container); border-radius: var(--md-shape-l);
}
.generation-spinner { width: 48px; height: 48px; }
.generation-progress h2 { margin: 0; font-size: 1.3rem; }
.generation-progress p { margin: 0; max-width: 36ch; }
.generation-message { min-height: 4.5em; }
@media (prefers-reduced-motion: reduce) {
  .generation-spinner { animation: none; }
}
</style>
