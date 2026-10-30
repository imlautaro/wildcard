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

      <label class="text-field">
        <input v-model="email" type="email" autocomplete="email" placeholder=" " required>
        <span>Email</span>
      </label>
      <label class="text-field">
        <input v-model="password" type="password" :autocomplete="registration ? 'new-password' : 'current-password'"
               placeholder=" " minlength="8" maxlength="128" required>
        <span>Password</span>
      </label>
      <p v-if="error" class="notice" role="alert" style="margin: 0 0 16px">{{ error }}</p>
      <button type="submit" class="button block" :disabled="!valid || busy">
        <span v-if="busy" class="spinner" />
        {{ registration ? 'Create account' : 'Sign in' }}
      </button>
      <button type="button" class="button text block" style="margin-top: 8px" :disabled="busy" @click="registration = !registration; error = null">
        {{ registration ? 'Already have an account? Sign in' : 'New here? Create account' }}
      </button>
    </form>
  </div>
</template>
