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
        <AppIconButton :icon="copied ? 'done' : 'copy'" :label="copied ? 'Copied' : 'Copy user ID'" @click="copyID" />
      </div>
      <AppButton block @click="signOut">Use another account</AppButton>
    </div>
    <form v-else class="auth-card" @submit.prevent="submit">
      <div class="mark" aria-hidden="true"><AppIcon name="shield" filled /></div>
      <h1>Wildcard Admin</h1>
      <p class="lead">Sign in with a super admin's Wildcard account.</p>
      <AppTextField v-model="email" label="Email" type="email" autocomplete="username" required />
      <AppTextField v-model="password" label="Password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required />
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :disabled="!valid" :loading="busy">Sign in</AppButton>
    </form>
  </div>
</template>
