<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Sign in · Wildcard' });

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
      <div class="mark" aria-hidden="true">
        <svg viewBox="0 0 37 40"><path fill="#fff" d="M13.2185 20.0246L2.68963 15.449C0 14.3009 -0.672407 12.5625 0.672407 10.2337L0.96761 9.7417C2.31242 7.44567 4.14924 7.16687 6.47807 8.90529L15.6786 15.7442L14.3501 4.32964C14.0221 1.44321 15.1866 0 17.8434 0H18.4338C21.0906 0 22.255 1.44321 21.927 4.32964L20.5986 15.7442L29.7991 8.90529C32.1279 7.16687 33.9647 7.44567 35.3096 9.7417L35.6048 10.2337C36.9496 12.5625 36.2772 14.3009 33.5875 15.449L23.0586 20.0246L33.5875 24.551C36.2772 25.6991 36.9496 27.4375 35.6048 29.7663L35.3096 30.2583C33.9647 32.5543 32.1279 32.8495 29.7991 31.1439L20.5986 24.2558L21.927 35.6704C22.255 38.5568 21.0906 40 18.4338 40H17.8434C15.1866 40 14.0221 38.5568 14.3501 35.6704L15.6786 24.2558L6.47807 31.1439C4.14924 32.8495 2.31242 32.5543 0.96761 30.2583L0.672407 29.7663C-0.672407 27.4375 0 25.6991 2.68963 24.551L13.2185 20.0246Z" /></svg>
      </div>
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
