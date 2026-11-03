<script setup lang="ts">
// Permanent self-deletion (docs/authentication.md#deleting-your-account). The
// current password confirms it, and the API checks it again. Escape, a backdrop
// press and Cancel are ignored while the deletion runs.
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const { deleteAccount } = useSession();
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const consequences = computed(() => (['contacts', 'agents', 'groups', 'media', 'shared'] as const)
  .map(key => t(`account.deleteAccount.${key}`)));

async function confirm() {
  if (!password.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    await deleteAccount(password.value);
  } catch (failure) {
    error.value = errorMessage(failure);
    busy.value = false;
  }
}

function cancel() {
  if (!busy.value) emit('close');
}
</script>

<template>
  <AppSheet :title="t('account.deleteAccount.confirmTitle')" icon="delete" danger @close="cancel">
    <form id="delete-account" @submit.prevent="confirm">
      <p>{{ t('account.deleteAccount.intro') }}</p>
      <ul class="consequences">
        <li v-for="item in consequences" :key="item">{{ item }}</li>
      </ul>
      <p>{{ t('account.deleteAccount.cleanup') }}</p>
      <AppTextField v-model="password" :label="t('account.deleteAccount.password')" type="password" autocomplete="current-password" maxlength="128" :disabled="busy" required />
      <AppNotice v-if="error">{{ error }}</AppNotice>
    </form>
    <template #actions>
      <AppButton variant="text" :disabled="busy" @click="cancel">{{ t('common.cancel') }}</AppButton>
      <AppButton type="submit" form="delete-account" variant="danger" :disabled="!password" :loading="busy">{{ busy ? t('account.deleteAccount.deleting') : t('account.deleteAccount.confirm') }}</AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
form > p { margin: 0 0 var(--space-3); color: var(--md-on-surface-variant); font: var(--type-body-medium); }
.consequences { display: grid; gap: var(--space-1-5); margin: 0 0 var(--space-4); padding-left: var(--space-5); color: var(--md-on-surface-variant); font: var(--type-body-medium); }
</style>
