<script setup lang="ts">
import { circleTypes, customStyleLimit } from '../../../../shared/onboarding';
definePageMeta({ layout: false });
const { user, refreshProfile, signOut } = useSession();
const { options, snapshot, draft, busy, refresh, submit } = useOnboarding();
const { t, te } = useI18n();
// The API names countries and languages in English (Intl.DisplayNames(['en'])); re-label
// them by code in the app language and sort them in that language's order.
function localized(list: readonly { code: string; name: string }[], type: 'region' | 'language') {
  const locale = appLocale();
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([locale], { type }); } catch { /* Keep the API names. */ }
  return list.map(option => {
    let label: string | undefined;
    try { label = names?.of(option.code); } catch { /* Unknown code: keep the API name. */ }
    // Spanish and other locales name languages in lowercase ("inglés"); list entries start uppercase, like iOS.
    if (label && type === 'language') label = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
    return { value: option.code, label: label && label !== option.code ? label : option.name };
  }).sort((a, b) => a.label.localeCompare(b.label, locale));
}
// Style and circle names are translated by code; an unknown code keeps the API's English name.
const styleKeys: Record<string, string> = { '3d': 'animated3d', pets: 'animatedPets', realistic: 'realisticPeople' };
const labelFor = (prefix: string, code: string, fallback: string) => {
  const key = `auth.onboarding.${prefix}.${styleKeys[code] ?? code}`;
  return te(key) ? t(key) : fallback;
};
const countryOptions = computed(() => localized(options.value?.countries ?? [], 'region'));
const languageOptions = computed(() => localized(options.value?.languages ?? [], 'language'));
const styleOptions = computed(() => (options.value?.styles ?? []).map(option => ({ value: option.code, label: labelFor('styles', option.code, option.name) })));
const circleOptions = computed(() => circleTypes.map(option => ({ value: option.code, label: labelFor('circles', option.code, option.name) })));
const genderOptions = computed(() => [{ value: 'male' as const, label: t('auth.onboarding.male') }, { value: 'female' as const, label: t('auth.onboarding.female') }]);
const error = ref<string | null>(null);
const locked = computed(() => !!snapshot.value?.input);
// A fresh draft suggests the interface language for contacts (still editable), like iOS.
onMounted(() => { if (!locked.value && !draft.name && draft.language === 'en') draft.language = appLocale(); });
const running = computed(() => snapshot.value?.status === 'queued' || snapshot.value?.status === 'generating');
const withContacts = computed(() => draft.createContacts !== false);
const customReady = computed(() => draft.style !== 'custom' || !!draft.customStyle?.trim());
const ready = computed(() => !!draft.name.trim() && !!draft.country && (locked.value || !withContacts.value || customReady.value) && (!withContacts.value || draft.sharedMemoryConsent) && (locked.value || !withContacts.value || draft.circleType === 'friends' || !!draft.occupation?.trim()) && (locked.value || (typeof draft.age === 'number' && Number.isInteger(draft.age) && draft.age >= 1 && draft.age <= 120)));
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
    // Progressive setup lets the person into the app while the circle is still being created.
    if (snapshot.value?.status === 'complete' || running.value) {
      await refreshProfile();
      if (!disposed && !user.value?.onboardingRequired) await navigateTo('/chats');
    }
  } catch (failure) { if (!disposed) error.value = errorMessage(failure); }
  finally { updating = false; if (!disposed) timer = setTimeout(update, running.value ? 3000 : 10000); }
}
async function start() {
  error.value = null;
  try {
    await submit();
    // The person enters the app right away; contacts keep being created in the chat list.
    await refreshProfile();
    if (!disposed && !user.value?.onboardingRequired) await navigateTo('/chats');
  }
  catch (failure) { error.value = errorMessage(failure); }
}
onMounted(() => {
  // 'New member' is the API's placeholder name from sign-up, not UI copy.
  if (!draft.name && user.value?.name !== 'New member') draft.name = user.value?.name ?? '';
  void update();
});
onBeforeUnmount(() => { disposed = true; if (timer) clearTimeout(timer); });
</script>

<template>
  <main class="auth">
    <form class="auth-card onboarding" @submit.prevent="start">
      <p class="eyebrow">{{ t('auth.onboarding.eyebrow') }}</p>
      <h1>{{ t('auth.onboarding.title') }}</h1>
      <p class="lead">{{ t('auth.onboarding.lead') }}</p>
      <template v-if="options">
        <fieldset :disabled="locked || busy" class="onboarding-fields">
          <div class="pair">
            <AppTextField v-model="draft.name" :label="t('auth.onboarding.name')" autocomplete="given-name" maxlength="100" required />
            <!-- Raw field: AppTextField's model is a string and the age is a number. -->
            <label class="text-field"><input v-model.number="draft.age" type="number" min="1" max="120" step="1" placeholder=" " :required="!locked"><span>{{ t('auth.onboarding.age') }}</span></label>
          </div>
          <div class="pair">
            <AppSelect v-model="draft.gender" :label="t('auth.onboarding.gender')" :disabled="locked || busy" :options="genderOptions" />
            <AppSelect v-model="draft.language" :label="t('auth.onboarding.language')" :disabled="locked || busy" :options="languageOptions" />
          </div>
          <AppSelect v-model="draft.country" :label="t('auth.onboarding.country')" :disabled="locked || busy" :options="countryOptions" />
          <label class="check-row"><input v-model="draft.createContacts" type="checkbox"><span>{{ t('auth.onboarding.createContacts') }}</span></label>
        </fieldset>
        <fieldset v-if="withContacts" :disabled="locked || busy" class="onboarding-fields">
          <AppSelect v-model="draft.style" :label="t('auth.onboarding.appearance')" :disabled="locked || busy" :options="styleOptions" />
          <AppTextField v-if="draft.style === 'custom'" v-model="draft.customStyle" :label="t('auth.onboarding.customStyle')" :placeholder="t('auth.onboarding.customStylePlaceholder')"
                        :maxlength="customStyleLimit" :required="!locked" />
          <AppSelect v-model="draft.circleType" :label="t('auth.onboarding.circle')" :disabled="locked || busy" :options="circleOptions" />
          <AppTextField v-if="draft.circleType !== 'friends'" v-model="draft.occupation" :label="draft.circleType === 'study' ? t('auth.onboarding.studying') : t('auth.onboarding.work')"
                        maxlength="200" :required="!locked" />
          <label class="check-row"><input v-model="draft.createGroup" type="checkbox"><span>{{ t('auth.onboarding.createGroup') }}</span></label>
        </fieldset>
        <template v-if="withContacts">
        <p class="hint info-title">{{ t('auth.onboarding.about') }} <InfoButton :label="t('auth.onboarding.about')" :text="t('auth.onboarding.aboutInfo')" /></p>
        <AppListGroup class="consent">
          <label class="check-row">
            <input v-model="draft.sharedMemoryConsent" type="checkbox" :disabled="locked || busy">
            <span>{{ t('auth.onboarding.consent') }}</span>
          </label>
        </AppListGroup>
        </template>
        <div v-if="running" role="status" aria-live="polite" class="progress">
          <span class="spinner" />
          <div>
            <strong>{{ snapshot?.status === 'queued' ? t('auth.onboarding.preparing') : t('auth.onboarding.creating', { count: snapshot?.photoCount ?? 0 }) }}</strong>
            <p>{{ t('auth.onboarding.canClose') }}</p>
          </div>
        </div>
        <AppNotice v-if="snapshot?.status === 'failed'">{{ t('auth.onboarding.failed') }}</AppNotice>
        <AppButton v-if="!running && snapshot?.status !== 'complete'" type="submit" block :disabled="!ready || busy">
          {{ busy ? t('common.saving') : locked ? t('auth.onboarding.retrySetup') : withContacts ? t('auth.onboarding.createCircle') : t('auth.onboarding.start') }}
        </AppButton>
      </template>
      <AppLoading v-else :label="t('auth.onboarding.loading')" />
      <AppNotice v-if="error" class="refresh-error">
        {{ error }}
        <template #actions><button type="button" class="link-button" @click="update">{{ t('auth.refresh') }}</button></template>
      </AppNotice>
      <AppButton variant="text" block class="sign-out" @click="signOut">{{ t('auth.signOut') }}</AppButton>
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
