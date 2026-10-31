<script setup lang="ts">
definePageMeta({ layout: false });

const { authenticate } = useSession();
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
      <p class="lead">{{ registration ? 'Create your account, then meet your circle.' : 'Sign in to continue your conversations.' }}</p>

      <AppTextField v-model="email" label="Email" type="email" autocomplete="email" required />
      <AppTextField v-model="password" label="Password" type="password" :autocomplete="registration ? 'new-password' : 'current-password'"
                    minlength="8" maxlength="128" required />
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :disabled="!valid" :loading="busy">
        {{ registration ? 'Create account' : 'Sign in' }}
      </AppButton>
      <AppButton variant="text" block :disabled="busy" @click="registration = !registration; error = null">
        {{ registration ? 'Already have an account? Sign in' : 'New here? Create account' }}
      </AppButton>
    </form>
  </div>
</template>

<style scoped>
.button + .button { margin-top: var(--space-2); }
</style>
