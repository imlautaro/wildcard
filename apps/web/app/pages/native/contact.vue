<script setup lang="ts">
useHead({ title: 'Open Wildcard contact' });
const route = useRoute();
const chats = useChats();
const error = ref<string | null>(null);
const busy = ref(false);
const agentID = computed(() => typeof route.query.agentID === 'string' && /^[a-f0-9-]{36}$/i.test(route.query.agentID) ? route.query.agentID : null);
async function open() {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    if (!agentID.value) { error.value = 'This contact link is invalid.'; return; }
    await chats.loadAllContacts();
    const contact = chats.contacts.value.find(contact => contact.agentID === agentID.value);
    if (!contact) { error.value = 'This contact link requires an existing invitation and accepted access.'; return; }
    await navigateTo(`/chats/${contact.id}`, { replace: true });
  } catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}
onMounted(open);
</script>
<template>
  <PageBar title="Open contact" back="/contacts" always-back />
  <div class="page"><div class="page-inner">
    <div v-if="busy" class="center"><span class="spinner" /> Opening…</div>
    <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
    <p class="group-footer" style="padding-top: 4px">Contact links open the same agent for existing participants. They do not grant access.</p>
    <button v-if="!busy" type="button" class="button secondary" @click="open">Try again</button>
  </div></div>
</template>
