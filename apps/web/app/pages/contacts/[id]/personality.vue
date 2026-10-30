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
const latestBirthday = computed(() => {
  try { return latestAdultBirthDate(Date.now(), draft.value.timeZone); }
  catch { return latestAdultBirthDate(); }
});
const temperamentOpen = ref(false);
// IANA zones for the searchable selector, keeping a saved value the browser lacks.
const timeZoneOptions = computed(() => {
  const zones: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const all = zones.includes(draft.value.timeZone) ? zones : [...zones, draft.value.timeZone];
  return [...all].sort().map(zone => ({ value: zone, label: zone.replaceAll('_', ' ') }));
});
const info = {
  generate: 'Generate all personality fields with Meta Standard, then review and save the draft. Your contact name and adult birthday stay the same.',
  experiment: 'One shared character, with a relationship that follows each person across chats and groups. Private conversations stay private. Only its creator can edit these settings.',
  identity: 'Briefly describe values, ways of thinking, conversational quirks and flaws. Expertise and topic interests are welcome; avoid invented jobs, studies, physical experiences or daily routines. Identity is expressed through replies and shared with everyone who talks to the contact. Conversation and mood do not rewrite it. Saving changes starts a fresh emotional history.',
  specialties: 'Things this contact is especially good at. These strengths are shared with everyone and independent of temperament. They can still talk about anything. Optional, up to 1,000 characters.',
  birthday: 'Age is calculated from the date of birth in the birthday time zone. February 29 is observed on February 28 in other years.',
  temperament: 'The contact expresses tendencies through tone and timing. It does not receive these scores. Feelings settle over time. Its acting direction adapts to each person without exposing private causes. Conversations with connections stay isolated. Follow-ups still respect your initiative switch and delivery limits.',
};
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
  <PageBar title="Personality" :back="`/contacts/${id}/edit`" always-back>
    <button type="button" class="icon-button" aria-label="Refresh personality" :disabled="busy" @click="discardAndRefresh"><AppIcon name="refresh" /></button>
  </PageBar>
  <div class="page"><form class="page-inner" @submit.prevent="submit">
    <p v-if="error || loadError" class="notice">{{ error ?? loadError }}</p>
    <div v-if="!value && busy" class="center"><span class="spinner" /> Loading personality…</div>
    <template v-if="value">
        <div class="group">
          <div v-if="canEdit" class="button-row-with-info">
            <button type="button" class="button-row" :disabled="busy" @click="generateDraft"><AppIcon name="star" />{{ draft.description ? 'Regenerate with AI' : 'Generate with AI' }}</button>
            <InfoButton label="Generate with AI" :text="info.generate" />
          </div>
          <label class="toggle">
            <span class="toggle-label"><AppIcon name="person" />Personality experiment<InfoButton label="Personality experiment" :text="info.experiment" /></span>
            <input v-model="draft.enabled" type="checkbox" role="switch" :disabled="!canEdit || busy">
          </label>
        </div>
        <div class="group-title info-title">Stable identity <InfoButton label="Stable identity" :text="info.identity" /></div>
        <div class="group">
          <div class="field personality-field"><textarea v-model="draft.description" :readonly="!canEdit" :disabled="busy" rows="5" aria-label="Stable identity" placeholder="Values, ways of thinking, humor, and conversational quirks. Two or three sentences are enough." /></div>
        </div>
        <div class="group-title info-title">Specialties <InfoButton label="Specialties" :text="info.specialties" /></div>
        <div class="group">
          <div class="field personality-field"><textarea v-model="draft.specialties" :readonly="!canEdit" :disabled="busy" rows="4" aria-label="Specialties" placeholder="Things this contact is especially good at." /></div>
        </div>
        <div class="group-title info-title">Birthday <InfoButton label="Birthday" :text="info.birthday" /></div>
        <div class="group">
          <div class="field"><label for="birth-date">Date of birth</label><input id="birth-date" :value="draft.birthDate ?? ''" type="date" :disabled="!canEdit || busy" min="1900-01-01" :max="latestBirthday" @input="draft.birthDate = ($event.target as HTMLInputElement).value || null"></div>
          <div class="field"><label for="birth-zone">Time zone</label><AppSelect id="birth-zone" v-model="draft.timeZone" variant="plain" :options="timeZoneOptions" :disabled="!canEdit || busy" /></div>
          <div v-if="facts?.age != null" class="button-row static">Age<span class="row-value">{{ facts.age }}{{ facts.isBirthday ? ' · Birthday today' : '' }}</span></div>
        </div>
        <div class="group" style="margin-top: 20px">
          <button type="button" class="button-row opens" @click="temperamentOpen = true"><AppIcon name="chart" />Temperament<span class="row-value">{{ personalityTraits.length }} traits</span></button>
        </div>
      <p v-if="!valid" class="notice">Use a birthday at least 18 years ago, a valid time zone, description up to 2,000 characters, specialties up to 1,000 characters, and whole-number traits from 1 to 10.</p>
      <p v-if="saved && !dirty" class="group-footer" role="status">Saved.</p>
      <button v-if="canEdit" type="submit" class="button block" style="margin-top: 12px" :disabled="busy || !valid || !dirty">Save personality</button>

      <AppSheet v-if="temperamentOpen" title="Temperament" @close="temperamentOpen = false">
        <template #header><InfoButton label="Temperament" :text="info.temperament" /></template>
        <div class="group">
          <label v-for="trait in personalityTraits" :key="trait.key" class="personality-trait">
            <span>{{ trait.label }} <output>{{ draft.traits[trait.key] }}</output></span>
            <input v-model.number="draft.traits[trait.key]" type="range" min="1" max="10" step="1" :aria-label="trait.label" :disabled="!canEdit || busy">
            <small><span>{{ trait.low }}</span><span>{{ trait.high }}</span></small>
          </label>
        </div>
        <template #actions><button type="button" class="button" @click="temperamentOpen = false">Done</button></template>
      </AppSheet>
    </template>
    <button v-else-if="!busy" type="button" class="button-row" @click="reload">Retry</button>
  </form></div>
</template>

<style scoped>
.personality-field { padding-top: 12px; padding-bottom: 12px; }
.personality-field textarea { font-size: 16px; color: var(--md-on-surface); width: 100%; }
.personality-trait > span { font-weight: 500; }
.personality-trait output { font-weight: 700; color: var(--md-primary); font-variant-numeric: tabular-nums; }
.personality-trait { display: flex; flex-direction: column; padding: 16px; gap: 10px; }
.personality-trait > span, .personality-trait small { display: flex; justify-content: space-between; gap: 12px; }
.personality-trait small { color: var(--secondary); }
.personality-trait input { width: 100%; accent-color: var(--accent); }
</style>
