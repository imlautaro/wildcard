<script setup lang="ts">
definePageMeta({ layout: false });
useHead({ title: 'Sign in' });

const { status, forbiddenUserID, signIn, signOut } = useSession();
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const copied = ref(false);

const valid = computed(() => /^\S+@\S+\.\S+$/.test(email.value.trim()) && password.value.length >= 8 && password.value.length <= 128);

async function submit() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await signIn(email.value.trim(), password.value);
    password.value = '';
    if (status.value === 'signed-in') await navigateTo('/');
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}

async function copyID() {
  if (!forbiddenUserID.value) return;
  await navigator.clipboard.writeText(forbiddenUserID.value).catch(() => {});
  copied.value = true;
}
</script>

<template>
  <div class="auth">
    <div v-if="status === 'forbidden'" class="auth-card">
      <div class="mark warning" aria-hidden="true"><AppIcon name="shield" /></div>
      <h1>Not a super admin</h1>
      <p class="lead">This Wildcard account can't use the admin panel. To grant access, add its user ID to <code>SUPER_ADMIN_USER_IDS</code> in <code>apps/api/wrangler.jsonc</code> and release the API.</p>
      <div v-if="forbiddenUserID" class="id-row">
        <span class="code">{{ forbiddenUserID }}</span>
        <button class="icon-button" type="button" :aria-label="copied ? 'Copied' : 'Copy user ID'" @click="copyID"><AppIcon name="copy" :filled="copied" /></button>
      </div>
      <button class="button block" type="button" @click="signOut">Use another account</button>
    </div>
    <form v-else class="auth-card" @submit.prevent="submit">
      <div class="mark" aria-hidden="true"><AppIcon name="shield" filled /></div>
      <h1>Wildcard Admin</h1>
      <p class="lead">Sign in with a super admin's Wildcard account.</p>
      <label class="text-field">
        <input v-model="email" type="email" autocomplete="username" placeholder=" " required>
        <span>Email</span>
      </label>
      <label class="text-field">
        <input v-model="password" type="password" autocomplete="current-password" placeholder=" " minlength="8" maxlength="128" required>
        <span>Password</span>
      </label>
      <p v-if="error" class="notice" role="alert" style="margin: 0 0 16px">{{ error }}</p>
      <button type="submit" class="button block" :disabled="!valid || busy">
        <span v-if="busy" class="spinner" />
        Sign in
      </button>
    </form>
  </div>
</template>
