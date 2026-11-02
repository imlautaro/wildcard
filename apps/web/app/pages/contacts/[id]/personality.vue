<script setup lang="ts">
import { birthdayFacts, latestAdultBirthDate, parsePersonality, personalityTraits } from '../../../../../../shared/personality';
import type { Contact } from '~/utils/types';

const route = useRoute();
const { t } = useI18n();
const id = computed(() => String(route.params.id));
const chats = useChats();
const session = useSession();
const accountID = session.user.value?.id;
const contact = ref<Contact | null>(chats.contacts.value.find(c => c.id === id.value) ?? null);
definePageMeta({ key: route => route.fullPath });
const { value, busy, error, refresh, save, generate, editor } = usePersonality(id);
const { draft, baseline, revision, saved } = toRefs(editor);
const loadError = ref<string | null>(null);
// Covers the contact fetch that precedes the personality request, so Retry only follows a failure.
const loading = ref(true);
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
const info = computed(() => ({
  generate: t('contacts.personality.info.generate'),
  experiment: t('contacts.personality.info.experiment'),
  identity: t('contacts.personality.info.identity'),
  specialties: t('contacts.personality.info.specialties'),
  birthday: t('contacts.personality.info.birthday'),
  temperament: t('contacts.personality.info.temperament'),
}));
// Trait copy is keyed by shared/personality.ts `key` (shared/ stays API-only, untranslated).
const traits = computed(() => personalityTraits.map(trait => ({
  key: trait.key,
  label: t(`contacts.personality.traits.${trait.key}.label`),
  low: t(`contacts.personality.traits.${trait.key}.low`),
  high: t(`contacts.personality.traits.${trait.key}.high`),
})));
async function generateDraft() {
  if (dirty.value && !window.confirm(t('contacts.personality.replaceConfirm'))) return;
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
// Leaving with unsaved edits asks first; confirming discards the cached draft too.
const unsaved = () => canEdit.value && dirty.value;
onBeforeRouteLeave(() => {
  if (!unsaved()) return true;
  if (!window.confirm(t('contacts.personality.leaveConfirm'))) return false;
  draft.value = JSON.parse(baseline.value);
  saved.value = false;
  return true;
});
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!unsaved()) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));
async function discardAndRefresh() {
  if (dirty.value && !window.confirm(t('contacts.personality.discardConfirm'))) return;
  await refresh(); apply(); saved.value = false;
}
async function load() {
  loading.value = true;
  loadError.value = null;
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
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <PageBar :title="$t('contacts.personality.title')" :back="`/contacts/${id}/edit`" always-back>
    <AppIconButton icon="refresh" :label="$t('contacts.personality.refresh')" :disabled="busy" @click="discardAndRefresh" />
    <AppButton v-if="value && canEdit" type="submit" form="personality-form" size="small" :disabled="busy || !valid || !dirty">{{ $t('common.save') }}</AppButton>
  </PageBar>
  <div class="page"><form id="personality-form" class="page-inner" @submit.prevent="submit">
    <AppNotice v-if="error || loadError">{{ error ?? loadError }}</AppNotice>
    <AppLoading v-if="!value && (busy || loading)" :label="$t('contacts.personality.loading')" fill />
    <template v-if="value">
      <AppListGroup>
        <div v-if="canEdit" class="button-row-with-info">
          <AppListItem icon="star" :disabled="busy" @click="generateDraft">{{ draft.description ? $t('contacts.personality.regenerate') : $t('contacts.personality.generate') }}</AppListItem>
          <InfoButton :label="$t('contacts.personality.generate')" :text="info.generate" />
        </div>
        <AppSwitch v-model="draft.enabled" icon="person" :label="$t('contacts.personality.experiment')" :info="info.experiment" :disabled="!canEdit || busy" />
      </AppListGroup>
      <AppListGroup :title="$t('contacts.personality.identity')" :info="info.identity">
        <div class="field personality-field"><textarea v-model="draft.description" :readonly="!canEdit" :disabled="busy" rows="5" :aria-label="$t('contacts.personality.identity')" :placeholder="$t('contacts.personality.identityPlaceholder')" /></div>
      </AppListGroup>
      <AppListGroup :title="$t('contacts.personality.specialties')" :info="info.specialties">
        <div class="field personality-field"><textarea v-model="draft.specialties" :readonly="!canEdit" :disabled="busy" rows="4" :aria-label="$t('contacts.personality.specialties')" :placeholder="$t('contacts.personality.specialtiesPlaceholder')" /></div>
      </AppListGroup>
      <AppListGroup :title="$t('contacts.personality.birthday')" :info="info.birthday">
        <div class="field"><label for="birth-date">{{ $t('contacts.personality.birthDate') }}</label><input id="birth-date" :value="draft.birthDate ?? ''" type="date" :disabled="!canEdit || busy" min="1900-01-01" :max="latestBirthday" @input="draft.birthDate = ($event.target as HTMLInputElement).value || null"></div>
        <div class="field"><label for="birth-zone">{{ $t('contacts.personality.timeZone') }}</label><AppSelect id="birth-zone" v-model="draft.timeZone" variant="plain" :options="timeZoneOptions" :disabled="!canEdit || busy" /></div>
        <AppListItem v-if="facts?.age != null" plain :value="facts.isBirthday ? $t('contacts.personality.ageBirthday', { age: facts.age }) : String(facts.age)">{{ $t('contacts.personality.age') }}</AppListItem>
      </AppListGroup>
      <AppListGroup>
        <AppListItem icon="chart" opens :value="$t('contacts.personality.traitCount', personalityTraits.length)" @click="temperamentOpen = true">{{ $t('contacts.personality.temperament') }}</AppListItem>
      </AppListGroup>
      <AppNotice v-if="!valid">{{ $t('contacts.personality.invalid') }}</AppNotice>
      <p v-if="saved && !dirty" class="group-footer" role="status">{{ $t('contacts.personality.saved') }}</p>

      <AppSheet v-if="temperamentOpen" :title="$t('contacts.personality.temperament')" @close="temperamentOpen = false">
        <template #header><InfoButton :label="$t('contacts.personality.temperament')" :text="info.temperament" /></template>
        <AppListGroup>
          <label v-for="trait in traits" :key="trait.key" class="personality-trait">
            <span>{{ trait.label }} <output>{{ draft.traits[trait.key] }}</output></span>
            <input v-model.number="draft.traits[trait.key]" type="range" min="1" max="10" step="1" :aria-label="trait.label" :disabled="!canEdit || busy">
            <small><span>{{ trait.low }}</span><span>{{ trait.high }}</span></small>
          </label>
        </AppListGroup>
        <template #actions><AppButton @click="temperamentOpen = false">{{ $t('common.done') }}</AppButton></template>
      </AppSheet>
    </template>
    <AppButton v-else-if="!busy && !loading && (error || loadError)" variant="text" icon="refresh" @click="load">{{ $t('common.retry') }}</AppButton>
  </form></div>
</template>

<style scoped>
.personality-field { padding-top: var(--space-3); padding-bottom: var(--space-3); }
.personality-field textarea { font-size: 16px; color: var(--md-on-surface); width: 100%; }
.personality-trait > span { font-weight: 500; }
.personality-trait output { font-weight: 700; color: var(--md-primary); font-variant-numeric: tabular-nums; }
.personality-trait { display: flex; flex-direction: column; padding: var(--space-4); gap: var(--space-2); }
.personality-trait > span, .personality-trait small { display: flex; justify-content: space-between; gap: var(--space-3); }
.personality-trait small { color: var(--md-on-surface-variant); }
.personality-trait input { width: 100%; accent-color: var(--md-primary); }
</style>
