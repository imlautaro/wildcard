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
  <PageBar title="New Group" back="/contacts" always-back />
  <div class="page">
    <form class="page-inner" @submit.prevent="create">
      <AppListGroup footer="After creating the group, add your contacts and invite people by email.">
        <div class="field"><input v-model="name" type="text" placeholder="Group name" aria-label="Group name" maxlength="100" autofocus></div>
      </AppListGroup>
      <div class="group-title">Shared memory</div>
      <ConsentFields
        v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
        :contributor-model="chats.contributorModel.value"
        :disclosure="['Group members can see your name and profile photo. Members can read the group\'s history, including messages sent before they joined, unless they were added without earlier messages. Contacts use what group members have told them, except chats kept private. What you say here can become a shared memory, used in this group and in private chats with its members, never in other groups. Leaving stops access to your contributed group memories; messages remain visible in the group until it is deleted.']"
        memory-label="I accept shared memory"
        contributor-note="Your selected model is Contributor. Group messages and shared memories sent to Meta may be used for model training."
      />
      <AppNotice v-if="error">{{ error }}</AppNotice>
      <AppButton type="submit" block :disabled="!valid || busy">Create Group</AppButton>
    </form>
  </div>
</template>

<style scoped>
.page-inner > .button { margin-top: var(--space-3); }
</style>
