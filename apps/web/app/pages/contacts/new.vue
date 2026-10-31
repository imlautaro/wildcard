<script setup lang="ts">
import type { Contact } from '~/utils/types';

const chats = useChats();
const mode = ref('manual');
const generation = useContactGeneration();
const { draft, job, options } = generation;
const running = computed(() => ['queued', 'generating'].includes(job.value?.status ?? ''));
const ready = computed(() => !!draft.country && Number.isInteger(draft.age) && draft.age >= 18 && draft.age <= 120);
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
      <AppSelect v-model="mode" label="Create contact" :options="[{ value: 'manual', label: 'Manually' }, { value: 'ai', label: 'Generate with AI' }]" />
      <form v-if="mode === 'manual'" @submit.prevent="create">
        <IdentityEditor :name="name || '?'" :path="null" />
        <AppListGroup>
          <div class="field"><input v-model="name" type="text" placeholder="Name" aria-label="Name" maxlength="100" autofocus></div>
        </AppListGroup>
        <AppNotice v-if="error">{{ error }}</AppNotice>
        <AppButton type="submit" block :disabled="!valid || busy">Create Contact</AppButton>
      </form>
      <form v-else @submit.prevent="generation.submit">
        <!-- Outlined selects follow, not a list group, so the title stays markup. -->
        <div class="group-title info-title">Your bot <InfoButton label="Your bot" text="These fields describe your bot. Your saved onboarding preferences are reused without asking for your details again. Generation uses Meta Standard processing." /></div>
        <fieldset v-if="options" class="bot-fields" :disabled="generation.busy.value || !!job">
          <AppSelect v-model="draft.style" label="Visual style" :options="options.styles.map(o => ({ value: o.code, label: o.name }))" />
          <AppSelect v-model="draft.purpose" label="Relationship" :options="[{ value: 'friends', label: 'Friend' }, { value: 'study', label: 'Study partner' }, { value: 'work', label: 'Work colleague' }]" />
          <label class="field">Age<input v-model.number="draft.age" type="number" min="18" max="120" step="1" required></label>
          <AppSelect v-model="draft.gender" label="Gender" :options="[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]" />
          <AppSelect v-model="draft.language" label="Preferred language" :options="options.languages.map(o => ({ value: o.code, label: o.name }))" />
          <AppSelect v-model="draft.country" label="Country" :options="options.countries.map(o => ({ value: o.code, label: o.name }))" />
        </fieldset>
        <AppLoading v-else label="Loading options…" />
        <p v-if="running" class="group-footer" role="status">Creating your contact and portrait… You can close the app and return later.</p>
        <AppNotice v-if="job?.status === 'failed'">Could not finish creating the contact. Create again to reuse the saved identity and portrait.</AppNotice>
        <AppNotice v-if="generation.error.value">
          {{ generation.error.value }}
          <template #actions><button type="button" class="link-button" @click="generation.refresh">Refresh</button></template>
        </AppNotice>
        <AppButton type="submit" block :disabled="!ready || generation.busy.value || running">Create Contact</AppButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
.bot-fields { border: 0; padding: 0; }
</style>
