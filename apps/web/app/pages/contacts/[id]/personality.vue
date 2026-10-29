<script setup lang="ts">
import { birthdayFacts, latestAdultBirthDate, parsePersonality, personalityTraits } from '../../../../../../shared/personality';
import type { Contact } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const session = useSession();
const accountID = session.user.value?.id;
const contact = ref<Contact | null>(chats.contacts.value.find(c => c.id === id.value) ?? null);
definePageMeta({ key: route => route.fullPath });
const { value, busy, error, refresh, save, generate, editor } = usePersonality(id);
const { draft, baseline, revision, saved } = toRefs(editor);
const loadError = ref<string | null>(null);
const canEdit = computed(() => contact.value?.role === 'owner');
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value);
const valid = computed(() => !!parsePersonality(draft.value));
const facts = computed(() => valid.value ? birthdayFacts(draft.value, Date.now()) : null);
useHead({ title: 'Personality' });
const latestBirthday = computed(() => {
  try { return latestAdultBirthDate(Date.now(), draft.value.timeZone); }
  catch { return latestAdultBirthDate(); }
});
async function generateDraft() {
  if (dirty.value && !window.confirm('Replace your unsaved personality draft with AI generation?')) return;
  await generate();
}

function apply() {
  if (!value.value || session.user.value?.id !== accountID) return;
  draft.value = structuredClone(toRaw(value.value.personality));
  baseline.value = JSON.stringify(value.value.personality);
  revision.value = value.value.revision;
  if (draft.value.timeZone === 'UTC' && value.value.revision === 0) {
    draft.value.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    baseline.value = JSON.stringify(draft.value);
  }
}
watch(value, () => { if (!dirty.value) apply(); });
async function reload() { await refresh(); if (!dirty.value) apply(); }
async function submit() {
  if (!canEdit.value || !valid.value || busy.value || session.user.value?.id !== accountID) return;
  const result = await save(structuredClone(toRaw(draft.value)), revision.value);
  if (result) { apply(); saved.value = true; }
}
async function discardAndRefresh() {
  if (dirty.value && !window.confirm('Discard your unsaved personality changes?')) return;
  await refresh(); apply(); saved.value = false;
}
onMounted(async () => {
  try {
    const result = await api<{ contact: Contact }>(`contacts/${id.value}`);
    if (session.user.value?.id !== accountID) return;
    contact.value = result.contact;
    chats.upsertContact(result.contact);
    await reload();
  } catch (failure) {
    if (failure instanceof ApiError && [403, 404].includes(failure.status)) {
      forgetPersonality(id.value);
      contact.value = null;
    }
    loadError.value = errorMessage(failure);
  }
});
</script>

<template>
  <PageBar title="Personality" :back="`/contacts/${id}/edit`" always-back />
  <div class="page"><form class="page-inner" @submit.prevent="submit">
    <p v-if="error || loadError" class="notice">{{ error ?? loadError }}</p>
    <div v-if="!value && busy" class="center"><span class="spinner" /> Loading personality…</div>
    <template v-if="value">
      <p class="group-footer">One shared character, with a relationship that follows each person across chats and groups. Private conversations stay private. Only its creator can edit these settings.</p>
      <fieldset :disabled="!canEdit || busy" class="personality-fields">
        <button v-if="canEdit" type="button" class="button-row" @click="generateDraft">{{ draft.description ? 'Regenerate with AI' : 'Generate with AI' }}</button>
        <p class="group-footer">Generate all personality fields with Meta Standard, then review and save the draft. Your contact name and adult birthday stay the same.</p>
        <div class="group"><label class="toggle"><span>Personality experiment</span><input v-model="draft.enabled" type="checkbox" role="switch"></label></div>
        <div class="group">
          <label class="field personality-field">Stable identity<textarea v-model="draft.description" rows="5" placeholder="Background, values, interests, and things this contact always knows about itself." /></label>
        </div>
        <p class="group-footer">This identity is shared with everyone who talks to the contact. Conversation and mood do not rewrite it. Use fictional information. Saving changes starts a fresh emotional history.</p>
        <div class="group">
          <label class="field personality-field">Specialties<textarea v-model="draft.specialties" rows="4" placeholder="Things this contact is especially good at." /></label>
        </div>
        <p class="group-footer">Things this contact is especially good at. These strengths are shared with everyone and independent of temperament. They can still talk about anything. Optional, up to 1,000 characters.</p>
        <div class="group">
          <label class="field personality-field">Date of birth<input :value="draft.birthDate ?? ''" type="date" min="1900-01-01" :max="latestBirthday" @input="draft.birthDate = ($event.target as HTMLInputElement).value || null"></label>
          <label class="field personality-field">Birthday time zone<input v-model="draft.timeZone" type="text" placeholder="America/Argentina/Buenos_Aires" spellcheck="false"></label>
        </div>
        <p class="group-footer">{{ facts?.age == null ? 'Age is calculated from the date of birth.' : `Age: ${facts.age}${facts.isBirthday ? ' · Birthday today' : ''}` }}. February 29 is observed on February 28 in other years.</p>
        <div class="group">
          <label v-for="trait in personalityTraits" :key="trait.key" class="personality-trait">
            <span>{{ trait.label }} <output>{{ draft.traits[trait.key] }}</output></span>
            <input v-model.number="draft.traits[trait.key]" type="range" min="1" max="10" step="1" :aria-label="trait.label">
            <small><span>{{ trait.low }}</span><span>{{ trait.high }}</span></small>
          </label>
        </div>
      </fieldset>
      <p class="group-footer">The contact expresses tendencies through tone and timing. It does not receive these scores. Feelings settle over time. Its acting direction adapts to each person without exposing private causes. Conversations with connections stay isolated. Follow-ups still respect your initiative switch and delivery limits.</p>
      <p v-if="!valid" class="notice">Use a birthday at least 18 years ago, a valid time zone, description up to 2,000 characters, specialties up to 1,000 characters, and whole-number traits from 1 to 10.</p>
      <p v-if="saved && !dirty" class="group-footer" role="status">Saved.</p>
      <button v-if="canEdit" type="submit" class="button block" :disabled="busy || !valid || !dirty">Save personality</button>
      <button type="button" class="button-row" :disabled="busy" @click="discardAndRefresh">Refresh personality</button>
    </template>
    <button v-else-if="!busy" type="button" class="button-row" @click="reload">Retry</button>
  </form></div>
</template>

<style scoped>
.personality-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
.personality-field { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding-top: 12px; padding-bottom: 12px; font-size: 13px; font-weight: 600; color: var(--md-on-surface-variant); }
.personality-field:focus-within { color: var(--md-primary); }
.personality-field :is(textarea, input) { font-size: 16px; font-weight: 400; color: var(--md-on-surface); width: 100%; }
.personality-trait > span { font-weight: 500; }
.personality-trait output { font-weight: 700; color: var(--md-primary); font-variant-numeric: tabular-nums; }
.personality-trait { display: flex; flex-direction: column; padding: 16px; gap: 10px; }
.personality-trait > span, .personality-trait small { display: flex; justify-content: space-between; gap: 12px; }
.personality-trait small { color: var(--secondary); }
.personality-trait input { width: 100%; accent-color: var(--accent); }
</style>
