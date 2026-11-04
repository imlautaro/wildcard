<script setup lang="ts">
// Early-access waitlist shown in place of sign-up while registration is closed
// (docs/authentication.md#early-access-waitlist), with self-hosting as the
// no-wait alternative. The parent keeps the Wildcard mark and the sign-in switch.
const props = defineProps<{ initialEmail?: string }>();
const emit = defineEmits<{ signIn: [] }>();
const { t, locale } = useI18n();

type Platform = 'ios' | 'web' | 'both';
const name = ref('');
const email = ref(props.initialEmail ?? '');
const platform = ref<Platform>('both');
const note = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const attempted = ref(false);

const platforms = computed(() => [
  { value: 'ios' as const, label: t('auth.waitlist.platformIOS') },
  { value: 'web' as const, label: t('auth.waitlist.platformWeb') },
  { value: 'both' as const, label: t('auth.waitlist.platformBoth') },
]);
const nameError = computed(() => attempted.value && !name.value.trim() ? t('auth.waitlist.nameRequired') : null);
const emailError = computed(() => attempted.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? t('auth.waitlist.emailInvalid') : null);

async function submit() {
  attempted.value = true;
  if (busy.value || nameError.value || emailError.value) return;
  busy.value = true;
  error.value = null;
  try {
    const submitted = email.value.trim();
    await api('waitlist', { json: { name: name.value.trim(), email: submitted, platform: platform.value, note: note.value.trim(), locale: locale.value } });
    waitlistJoinedEmail.value = submitted;
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="waitlist">
    <template v-if="waitlistJoinedEmail">
      <div class="joined-badge" aria-hidden="true"><AppIcon name="check" /></div>
      <h1>{{ t('auth.waitlist.joinedTitle') }}</h1>
      <p class="lead">{{ t('auth.waitlist.joinedLead', { email: waitlistJoinedEmail }) }}</p>
    </template>
    <form v-else novalidate @submit.prevent="submit">
      <span class="eyebrow">{{ t('auth.waitlist.eyebrow') }}</span>
      <h1>{{ t('auth.waitlist.title') }}</h1>
      <p class="lead">{{ t('auth.waitlist.lead') }}</p>

      <div class="fields">
        <AppTextField v-model="name" :label="t('auth.waitlist.name')" autocomplete="name" maxlength="100" :error="nameError" :disabled="busy" />
        <AppTextField v-model="email" :label="t('auth.signIn.email')" type="email" autocomplete="email" maxlength="254" :error="emailError" :disabled="busy" />
        <div class="platform">
          <span class="field-label">{{ t('auth.waitlist.platform') }}</span>
          <AppSegmented v-model="platform" :options="platforms" :label="t('auth.waitlist.platform')" :disabled="busy" />
        </div>
        <AppTextField v-model="note" :label="t('auth.waitlist.note')" multiline rows="3" maxlength="500"
                      :supporting="t('auth.waitlist.noteHint')" :disabled="busy" />
      </div>
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :loading="busy">{{ t('auth.waitlist.submit') }}</AppButton>
      <p class="fine-print">{{ t('auth.waitlist.privacy') }}</p>
    </form>

    <div class="divider" role="separator"><span>{{ t('auth.waitlist.or') }}</span></div>

    <section class="self-host" :aria-label="t('auth.waitlist.selfHostTitle')">
      <div class="self-host-head">
        <span class="self-host-icon" aria-hidden="true"><AppIcon name="bolt" /></span>
        <div>
          <h2>{{ t('auth.waitlist.selfHostTitle') }}</h2>
          <p>{{ t('auth.waitlist.selfHostText') }}</p>
        </div>
      </div>
      <div class="self-host-actions">
        <AppButton :to="selfHost.deployUrl" target="_blank" rel="noopener" variant="tonal" trailing-icon="open-in-new">
          {{ t('auth.waitlist.deploy') }}
        </AppButton>
        <AppButton :to="selfHost.guideUrl(locale)" target="_blank" rel="noopener" variant="text">
          {{ t('auth.waitlist.guide') }}
        </AppButton>
      </div>
    </section>

    <AppButton variant="text" block class="back" @click="emit('signIn')">{{ t('auth.signIn.haveAccount') }}</AppButton>
  </div>
</template>

<style scoped>
.eyebrow {
  display: block; margin-bottom: var(--space-2); text-align: center; color: var(--md-primary);
  font: var(--type-label-medium); letter-spacing: .08em; text-transform: uppercase;
}
.fields { display: grid; gap: var(--space-4); margin-bottom: var(--space-4); }
.platform { display: grid; gap: var(--space-2); }
.field-label { color: var(--md-on-surface-variant); font: var(--type-label-large); }
.fine-print { margin: var(--space-3) 0 0; text-align: center; color: var(--md-on-surface-variant); font: var(--type-body-small); }
.joined-badge {
  display: grid; place-items: center; width: 56px; height: 56px; margin: 0 auto var(--space-4); border-radius: var(--md-shape-full);
  background: var(--md-primary-container); color: var(--md-on-primary-container);
}
.joined-badge :deep(svg) { width: 28px; height: 28px; }
.divider {
  display: flex; align-items: center; gap: var(--space-3); margin: var(--space-6) 0;
  color: var(--md-on-surface-variant); font: var(--type-label-medium); text-transform: uppercase; letter-spacing: .08em;
}
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--md-outline-variant); }
.self-host { padding: var(--space-4); border-radius: var(--md-shape-l); background: var(--md-surface-container-low); }
.self-host-head { display: flex; gap: var(--space-3); align-items: flex-start; }
.self-host-icon {
  display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: var(--md-shape-m);
  background: var(--md-surface-container-highest); color: var(--md-primary);
}
.self-host h2 { margin: 0 0 var(--space-1); font: var(--type-title-small); text-align: left; letter-spacing: normal; }
.self-host p { margin: 0; color: var(--md-on-surface-variant); font: var(--type-body-medium); }
.self-host-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
.back { margin-top: var(--space-4); }
</style>
