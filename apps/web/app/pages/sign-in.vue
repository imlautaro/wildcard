<script setup lang="ts">
definePageMeta({ layout: false });

const { authenticate } = useSession();
const { t } = useI18n();
const registration = ref(false);
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const valid = computed(() => /^\S+@\S+\.\S+$/.test(email.value.trim()) && password.value.length >= 8 && password.value.length <= 128);

async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    // 'New member' is the API placeholder name until onboarding (compared in onboarding.vue); not UI copy.
    await authenticate(email.value.trim(), password.value, registration.value ? 'New member' : null);
    password.value = '';
    await navigateTo('/');
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="auth">
    <form class="auth-card" @submit.prevent="submit">
      <img class="mark" src="/icon.svg" width="64" height="64" alt="" aria-hidden="true">
      <h1>Wildcard</h1>
      <p class="lead">{{ registration ? t('auth.signIn.leadRegister') : t('auth.signIn.lead') }}</p>

      <AppTextField v-model="email" :label="t('auth.signIn.email')" type="email" autocomplete="email" required />
      <AppTextField v-model="password" :label="t('auth.signIn.password')" type="password" :autocomplete="registration ? 'new-password' : 'current-password'"
                    minlength="8" maxlength="128" required />
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :disabled="!valid" :loading="busy">
        {{ registration ? t('auth.signIn.createAccount') : t('auth.signIn.signIn') }}
      </AppButton>
      <AppButton variant="text" block :disabled="busy" @click="registration = !registration; error = null">
        {{ registration ? t('auth.signIn.haveAccount') : t('auth.signIn.newHere') }}
      </AppButton>
    </form>
  </div>
</template>

<style scoped>
.button + .button { margin-top: var(--space-2); }
</style>
