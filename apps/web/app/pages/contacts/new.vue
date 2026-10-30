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
        <div class="group">
          <div class="field"><input v-model="name" type="text" placeholder="Name" aria-label="Name" maxlength="100" autofocus></div>
        </div>
        <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
        <button type="submit" class="button block" :disabled="!valid || busy">Create Contact</button>
      </form>
      <form v-else @submit.prevent="generation.submit">
        <div class="group-title info-title">Your bot <InfoButton label="Your bot" text="These fields describe your bot. Your saved onboarding preferences are reused without asking for your details again. Generation uses Meta Standard processing." /></div>
        <fieldset :disabled="generation.busy.value || !!job" style="border: 0; padding: 0" v-if="options">
          <AppSelect v-model="draft.style" label="Visual style" :options="options.styles.map(o => ({ value: o.code, label: o.name }))" />
          <AppSelect v-model="draft.purpose" label="Relationship" :options="[{ value: 'friends', label: 'Friend' }, { value: 'study', label: 'Study partner' }, { value: 'work', label: 'Work colleague' }]" />
          <label class="field">Age<input v-model.number="draft.age" type="number" min="18" max="120" step="1" required></label>
          <AppSelect v-model="draft.gender" label="Gender" :options="[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]" />
          <AppSelect v-model="draft.language" label="Preferred language" :options="options.languages.map(o => ({ value: o.code, label: o.name }))" />
          <AppSelect v-model="draft.country" label="Country" :options="options.countries.map(o => ({ value: o.code, label: o.name }))" />
        </fieldset>
        <p v-else class="group-footer">Loading options…</p>
        <p v-if="running" class="group-footer" role="status">Creating your contact and portrait… You can close the app and return later.</p>
        <p v-if="job?.status === 'failed'" class="notice">Could not finish creating the contact. Create again to reuse the saved identity and portrait.</p>
        <p v-if="generation.error.value" class="notice">{{ generation.error.value }} <button type="button" class="link-button" @click="generation.refresh">Refresh</button></p>
        <button type="submit" class="button block" :disabled="!ready || generation.busy.value || running">Create Contact</button>
      </form>
    </div>
  </div>
</template>
