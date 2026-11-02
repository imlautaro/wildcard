<script setup lang="ts">
import type { Contact } from '~/utils/types';
import { customStyleLimit } from '../../../../../shared/onboarding';
import { parseContactName } from '../../../../../shared/contact-generation';

// One form (docs/contact-generation.md): the personality is always generated, and an
// empty name or a "Generate with AI" photo is generated too, in the background job.
const chats = useChats();
const generation = useContactGeneration();
const { draft, job, options, upload } = generation;
const running = computed(() => ['queued', 'generating'].includes(job.value?.status ?? ''));
const creating = computed(() => generation.busy.value || running.value);
const { t } = useI18n();
const progressMessages = computed(() => [
  t('contacts.new.progress.first'),
  t('contacts.new.progress.second'),
  t('contacts.new.progress.third'),
]);
const purposeOptions = computed(() => [
  { value: 'friends', label: t('contacts.new.purposes.friends') },
  { value: 'study', label: t('contacts.new.purposes.study') },
  { value: 'work', label: t('contacts.new.purposes.work') },
]);
const genderOptions = computed(() => [{ value: 'male', label: t('contacts.new.genders.male') }, { value: 'female', label: t('contacts.new.genders.female') }]);
const photoOptions = computed(() => (['generate', 'upload', 'none'] as const).map(value => ({ value, label: t(`contacts.new.photoSources.${value}`) })));
// Without a generated portrait only the character themes (pets, custom) still matter:
// the other visual styles collapse into "Person", restoring the last one on the way back.
const themed = (style: string) => style === 'pets' || style === 'custom';
let portraitStyle = draft.style;
watch(() => draft.style, style => { if (!themed(style)) portraitStyle = style; });
const character = computed({
  get: () => themed(draft.style) ? draft.style : 'person',
  set: (value: string) => { draft.style = (value === 'person' ? (themed(portraitStyle) ? 'cartoon' : portraitStyle) : value) as typeof draft.style; },
});
const characterOptions = computed(() => [{ value: 'person', label: t('contacts.new.person') },
  ...(options.value?.styles ?? []).filter(o => themed(o.code)).map(o => ({ value: o.code, label: o.name }))]);
const age = computed({ get: () => String(draft.age), set: (value: string) => { draft.age = Number(value); } });
const progressIndex = ref(0);
watch(creating, (active, _, onCleanup) => {
  progressIndex.value = 0;
  if (!active) return;
  const rotation = setInterval(() => { progressIndex.value = (progressIndex.value + 1) % progressMessages.value.length; }, 5000);
  onCleanup(() => clearInterval(rotation));
}, { immediate: true });
const nameValid = computed(() => !draft.name.trim() || !!parseContactName(draft.name));
// A submitted job (a failed one being retried) already has its photo on the server.
const photoReady = computed(() => draft.photo !== 'upload' || !!upload.value || !!job.value);
const ready = computed(() => !!draft.country && Number.isInteger(draft.age) && draft.age >= 18 && draft.age <= 120
  && (draft.style !== 'custom' || !!draft.customStyle?.trim()) && nameValid.value && photoReady.value);
// Local preview of the chosen upload; revoked when replaced or on leave.
const preview = ref<string | null>(null);
watch(upload, (blob, _, onCleanup) => {
  preview.value = blob ? URL.createObjectURL(blob) : null;
  const url = preview.value;
  onCleanup(() => { if (url) URL.revokeObjectURL(url); });
}, { immediate: true });
function setPhoto(photo: Blob | null) {
  upload.value = photo;
  if (!photo && draft.photo === 'upload') draft.photo = 'generate';
}
const identity = ref<{ choose: () => void } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
async function poll() {
  await generation.refresh();
  if (!disposed) timer = setTimeout(poll, running.value ? 3000 : 10000);
}
onMounted(() => { void poll(); });
// A completed generation opens the new contact's chat.
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
</script>

<template>
  <PageBar :title="$t('contacts.new.title')" back="/contacts" always-back>
    <AppButton type="submit" form="contact-form" size="small" :disabled="!ready || generation.busy.value || running">{{ creating ? $t('contacts.new.creating') : $t('contacts.new.create') }}</AppButton>
  </PageBar>
  <div class="page">
    <form id="contact-form" class="page-inner" @submit.prevent="generation.submit">
      <section v-if="creating" class="generation-progress" aria-labelledby="generation-title">
        <span class="spinner generation-spinner" aria-hidden="true" />
        <h2 id="generation-title">{{ running ? $t('contacts.new.creatingTitle') : $t('contacts.new.startingTitle') }}</h2>
        <p class="generation-message" role="status" aria-live="polite" aria-atomic="true">{{ running ? progressMessages[progressIndex] : $t('contacts.new.sending') }}</p>
        <p v-if="running" class="muted">{{ $t('contacts.new.background') }}</p>
      </section>
      <template v-else>
        <fieldset class="bot-fields" :disabled="generation.busy.value || !!job">
          <IdentityEditor ref="identity" :name="draft.name.trim() || '?'" :path="null" :src="draft.photo === 'upload' ? preview : null"
                          :editable="draft.photo === 'upload'" :busy="generation.busy.value || !!job" :generating="draft.photo === 'generate'" @photo="setPhoto" />
          <AppListGroup :title="$t('contacts.new.contact')" :footer="$t('contacts.new.aiFooter')">
            <div class="field">
              <label for="contact-name">{{ $t('contacts.new.name') }}</label>
              <input id="contact-name" v-model="draft.name" type="text" maxlength="100" :placeholder="$t('contacts.new.namePlaceholder')" autocomplete="off">
            </div>
            <div class="field">
              <label for="contact-photo">{{ $t('contacts.new.photo') }}</label>
              <AppSelect id="contact-photo" v-model="draft.photo" variant="plain" :options="photoOptions" />
            </div>
            <AppListItem v-if="draft.photo === 'upload' && !upload" icon="image" @click="identity?.choose()">{{ $t('contacts.new.choosePhoto') }}</AppListItem>
          </AppListGroup>
          <!-- Outlined selects follow, not a list group, so the title stays markup. -->
          <div class="group-title info-title">{{ $t('contacts.new.yourBot') }} <InfoButton :label="$t('contacts.new.yourBot')" :text="$t('contacts.new.yourBotInfo')" /></div>
          <template v-if="options">
            <AppSelect v-if="draft.photo === 'generate'" v-model="draft.style" :label="$t('contacts.new.visualStyle')" :options="options.styles.map(o => ({ value: o.code, label: o.name }))" />
            <AppSelect v-else v-model="character" :label="$t('contacts.new.character')" :options="characterOptions" />
            <AppTextField v-if="draft.style === 'custom'" v-model="draft.customStyle" :label="$t('contacts.new.describeCharacter')" :placeholder="$t('contacts.new.describePlaceholder')"
                          :maxlength="customStyleLimit" required />
            <AppSelect v-model="draft.purpose" :label="$t('contacts.new.relationship')" :options="purposeOptions" />
            <AppTextField v-model="age" :label="$t('contacts.new.age')" type="number" inputmode="numeric" min="18" max="120" step="1" required />
            <AppSelect v-model="draft.gender" :label="$t('contacts.new.gender')" :options="genderOptions" />
            <AppSelect v-model="draft.language" :label="$t('contacts.new.language')" :options="options.languages.map(o => ({ value: o.code, label: o.name }))" />
            <AppSelect v-model="draft.country" :label="$t('contacts.new.country')" :options="options.countries.map(o => ({ value: o.code, label: o.name }))" />
          </template>
          <AppLoading v-else :label="$t('contacts.new.loadingOptions')" />
        </fieldset>
      </template>
      <AppNotice v-if="job?.status === 'failed' && !creating">{{ $t('contacts.new.failed') }}</AppNotice>
      <AppNotice v-if="generation.error.value">
        {{ generation.error.value }}
        <template #actions><button type="button" class="link-button" @click="generation.refresh">{{ $t('contacts.new.refresh') }}</button></template>
      </AppNotice>
    </form>
  </div>
</template>

<style scoped>
.bot-fields { border: 0; padding: 0; margin: 0; min-width: 0; }
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
