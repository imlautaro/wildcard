<script setup lang="ts">
import type { Contact } from '~/utils/types';

useHead({ title: 'New Contact' });
const chats = useChats();
const name = ref('');
const busy = ref(false);
const error = ref<string | null>(null);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100);

async function create() {
  if (!valid.value || busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const { contact } = await api<{ contact: Contact }>('contacts', { json: { name: name.value.trim() } });
    chats.upsertContact({ ...contact, lastMessageAt: null, lastMessageText: null });
    await navigateTo(`/chats/${contact.id}`, { replace: true });
  } catch (failure) {
    error.value = errorMessage(failure);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PageBar title="New Contact" back="/contacts" always-back />
  <div class="page">
    <form class="page-inner" @submit.prevent="create">
      <IdentityEditor :name="name || '?'" :path="null" />
      <div class="group">
        <div class="field"><input v-model="name" type="text" placeholder="Name" aria-label="Name" maxlength="100" autofocus></div>
      </div>
      <p class="group-footer">Each contact is an AI agent with its own memory. You can add a photo after creating it.</p>
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <button type="submit" class="button block" :disabled="!valid || busy">Create Contact</button>
    </form>
  </div>
</template>
