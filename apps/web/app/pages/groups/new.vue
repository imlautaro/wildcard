<script setup lang="ts">
const chats = useChats();
const name = ref('');
const shareMemory = ref(false);
const contributorConsent = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100
  && shareMemory.value && (!chats.contributorModel.value || contributorConsent.value));

async function create() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { id } = await api<{ id: string }>('groups', {
      json: { name: name.value.trim(), shareMemory: true, contributorConsent: contributorConsent.value },
    });
    await chats.refresh();
    await navigateTo(`/groups/${id}/members`, { replace: true });
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}

onMounted(() => { if (!chats.loaded.value) void chats.refresh(); });
</script>

<template>
  <PageBar :title="$t('groups.new.title')" back="/contacts" always-back />
  <div class="page">
    <form class="page-inner" @submit.prevent="create">
      <AppListGroup :footer="$t('groups.new.footer')">
        <div class="field"><input v-model="name" type="text" :placeholder="$t('groups.new.name')" :aria-label="$t('groups.new.name')" maxlength="100" autofocus></div>
      </AppListGroup>
      <div class="group-title">{{ $t('groups.new.sharedMemory') }}</div>
      <ConsentFields
        v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
        :contributor-model="chats.contributorModel.value"
        :disclosure="[$t('groups.new.disclosure')]"
        :memory-label="$t('groups.new.memoryLabel')"
        :contributor-note="$t('groups.new.contributorNote')"
      />
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :disabled="!valid || busy">{{ $t('groups.new.create') }}</AppButton>
    </form>
  </div>
</template>

<style scoped>
.page-inner > .button { margin-top: var(--space-3); }
</style>
