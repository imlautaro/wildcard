<script setup lang="ts">
useHead({ title: 'New Group' });
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
      <div class="group">
        <div class="field"><input v-model="name" type="text" placeholder="Group name" aria-label="Group name" maxlength="100" autofocus></div>
      </div>
      <p class="group-footer">After creating the group, add your contacts and invite people by email.</p>
      <div class="group-title">Shared memory</div>
      <ConsentFields
        v-model:share-memory="shareMemory" v-model:contributor-consent="contributorConsent"
        :contributor-model="chats.contributorModel.value"
        :disclosure="['Group members can see your name and profile photo. Everyone in this group can read its full history, including messages sent before they joined. Contacts use shared memories from their other conversations. What you say here can become a shared memory and be recalled in other chats with these contacts. Leaving stops access to your contributed group memories; messages remain visible in the group until it is deleted.']"
        memory-label="I accept shared memory"
        contributor-note="This installation uses Meta's Contributor model. Group messages and shared memories sent to Meta may be used for model training."
      />
      <p v-if="error" class="notice" style="margin: 12px 0">{{ error }}</p>
      <button type="submit" class="button block" style="margin-top: 12px" :disabled="!valid || busy">Create Group</button>
    </form>
  </div>
</template>
