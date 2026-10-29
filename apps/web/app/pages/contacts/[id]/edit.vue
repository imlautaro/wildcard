<script setup lang="ts">
import type { ChatMediaItem, Contact } from '~/utils/types';

const route = useRoute();
const id = computed(() => String(route.params.id));
const chats = useChats();
const session = useSession();
const ownerID = session.user.value?.id;
const contact = ref<Contact | null>(chats.contacts.value.find((item) => item.id === id.value) ?? null);
const name = ref(contact.value?.name ?? '');
const busy = ref(false);
const error = ref<string | null>(null);
const saved = ref(false);
const canManage = computed(() => contact.value?.role !== 'member');
const changed = computed(() => !!contact.value && name.value.trim() !== contact.value.name);
const valid = computed(() => name.value.trim().length > 0 && [...name.value.trim()].length <= 100);
useHead({ title: computed(() => contact.value?.name ?? 'Contact') });

function apply(updated: Contact) {
  if (session.user.value?.id !== ownerID || updated.id !== id.value) return;
  contact.value = { ...contact.value, ...updated };
  chats.upsertContact(updated);
}

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  saved.value = false;
  try { await task(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}

const saveName = () => run(async () => {
  if (!valid.value) return;
  apply((await api<{ contact: Contact }>(`contacts/${id.value}`, { method: 'PATCH', json: { name: name.value.trim() } })).contact);
  name.value = contact.value!.name;
  saved.value = true;
});

const setInitiative = (event: Event) => run(async () => {
  const input = event.target as HTMLInputElement;
  try {
    const updated = await chats.setInitiative(id.value, input.checked);
    if (updated) apply(updated);
  } finally {
    input.checked = contact.value?.initiativeEnabled !== 0;
  }
});

// Media paths match the chat bubbles, so thumbnails share the private image cache.
function mediaPath(item: ChatMediaItem) {
  return `contacts/${id.value}/chat/turns/${item.messageID}/attachment${item.side === 'assistant' ? '?side=assistant' : ''}`;
}

const savePhoto = (photo: Blob | null) => run(async () => {
  const path = `contacts/${id.value}/photo`;
  const result = photo
    ? await api<{ contact: Contact }>(path, { method: 'PUT', body: photo })
    : await api<{ contact: Contact }>(path, { method: 'DELETE' });
  apply(result.contact);
});

const remove = () => run(async () => {
  const message = canManage.value
    ? `This permanently deletes ${contact.value?.name ?? 'this contact'} for everyone, including all participants' chats, schedules, and memories.`
    : 'This removes your access and deletes your private chat, schedules, and contributed memories. Other participants keep the contact.';
  if (!window.confirm(message)) return;
  await api(`contacts/${id.value}`, { method: 'DELETE' });
  chats.removeContact(id.value);
  forgetContactEnergy(id.value);
  forgetPersonality(id.value);
  forgetMcpConnections(id.value);
  forgetMiniApps(`contacts/${id.value}`);
  forgetRead(`contact:${id.value}`);
  await navigateTo('/', { replace: true });
});

onMounted(() => run(async () => {
  const fresh = (await api<{ contact: Contact }>(`contacts/${id.value}`)).contact;
  const untouched = !contact.value || name.value === contact.value.name;
  apply(fresh);
  if (untouched) name.value = fresh.name;
}));
</script>

<template>
  <PageBar :title="contact?.name ?? 'Contact'" :back="`/chats/${id}`" always-back />
  <div class="page">
    <div v-if="!contact && busy" class="center"><span class="spinner" /> Loading…</div>
    <div v-else-if="!contact" class="page-inner"><p class="notice">{{ error ?? 'This contact is no longer available.' }}</p></div>
    <form v-else class="page-inner" @submit.prevent="saveName">
      <IdentityEditor :name="contact.name" :path="contactPhotoPath(contact)" :editable="canManage" :busy="busy" @photo="savePhoto" />
      <div class="group">
        <div class="field">
          <label for="contact-name">Name</label>
          <input id="contact-name" v-model="name" type="text" maxlength="100" :readonly="!canManage">
        </div>
      </div>
      <p v-if="!canManage" class="group-footer">This is a shared contact. Its creator manages its name, photo, and participants.</p>
      <p v-if="error" class="notice" style="margin: 0 0 12px">{{ error }}</p>
      <p v-if="saved" class="group-footer" role="status">Saved.</p>
      <button v-if="canManage" type="submit" class="button block" :disabled="!changed || !valid || busy" style="margin-bottom: 20px">Save</button>

      <div class="group">
        <label class="toggle">
          <span>Conversation initiative</span>
          <input type="checkbox" role="switch" :checked="contact.initiativeEnabled !== 0" :disabled="busy" @change="setInitiative">
        </label>
      </div>
      <p class="group-footer">Allow thoughtful follow-ups when you have not replied. Stops after a few unanswered messages. Applies only to your private chat.</p>

      <ContactEnergySection v-if="contact.role === 'owner'" :contact-id="id" />

      <ChatMediaTabs :base="`contacts/${id}/chat`" :attachment-path="mediaPath" :documents-base="`contacts/${id}`" :document-route="`/contacts/${id}/documents`" />

      <div class="group" style="margin-top: 20px">
        <NuxtLink :to="`/contacts/${id}/connections`" class="button-row"><AppIcon name="link" />Connections</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/personality`" class="button-row"><AppIcon name="person" />Personality</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/mini-apps`" class="button-row"><AppIcon name="grid" />Mini apps</NuxtLink>
        <NuxtLink :to="`/contacts/${id}/tasks`" class="button-row"><AppIcon name="tasks" />Tasks</NuxtLink>
        <NuxtLink :to="`/chats/${id}`" class="button-row"><AppIcon name="chat" />Open chat</NuxtLink>
        <NuxtLink v-if="canManage" :to="`/contacts/${id}/sharing`" class="button-row"><AppIcon name="share" />Share contact</NuxtLink>
      </div>
      <div class="group" style="margin-top: 20px">
        <button type="button" class="button-row danger" :disabled="busy" @click="remove">{{ canManage ? 'Delete contact' : 'Leave shared contact' }}</button>
      </div>
    </form>
  </div>
</template>
