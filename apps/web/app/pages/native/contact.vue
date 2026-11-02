<script setup lang="ts">
const route = useRoute();
const { t } = useI18n();
const chats = useChats();
const error = ref<string | null>(null);
const busy = ref(false);
const agentID = computed(() => typeof route.query.agentID === 'string' && /^[a-f0-9-]{36}$/i.test(route.query.agentID) ? route.query.agentID : null);
async function open() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (!agentID.value) { error.value = t('auth.contactLink.invalid'); return; }
    await chats.loadAllContacts();
    const contact = chats.contacts.value.find(contact => contact.agentID === agentID.value);
    if (!contact) { error.value = translate('auth.contactLink.noAccess'); return; }
    await navigateTo(`/chats/${contact.id}`, { replace: true });
  } catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}
onMounted(open);
</script>
<template>
  <PageBar :title="t('auth.contactLink.title')" back="/contacts" always-back />
  <div class="page"><div class="page-inner">
    <AppLoading v-if="busy" :label="t('auth.contactLink.opening')" />
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <p class="group-footer">{{ t('auth.contactLink.help') }}</p>
    <div v-if="!busy" class="actions-row"><AppButton variant="tonal" @click="open">{{ t('common.tryAgain') }}</AppButton></div>
  </div></div>
</template>
