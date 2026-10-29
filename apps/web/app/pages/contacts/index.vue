<script setup lang="ts">
useHead({ title: 'Contacts' });
const chats = useChats();
const query = ref('');
const loading = ref(!chats.allContactsLoaded.value);
const error = ref<string | null>(null);

const visible = computed(() => {
  const term = query.value.trim().toLocaleLowerCase();
  return term ? chats.directory.value.filter((contact) => contact.name.toLocaleLowerCase().includes(term)) : chats.directory.value;
});

onMounted(async () => {
  try { await chats.loadAllContacts(); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { loading.value = false; }
});
</script>

<template>
  <PageBar title="Contacts" />
  <div class="scroll">
    <label class="search-field">
      <AppIcon name="search" />
      <input v-model="query" type="search" placeholder="Search contacts" aria-label="Search contacts">
    </label>
    <ul v-if="!query" class="list">
      <li><NuxtLink to="/groups/new" class="row action-row"><span class="glyph"><AppIcon name="people" /></span><span class="body">Create group</span></NuxtLink></li>
      <li>
        <NuxtLink to="/invitations" class="row action-row">
          <span class="glyph"><AppIcon name="mail" /></span>
          <span class="body"><span class="top"><span style="flex: 1">Invitations</span><span v-if="chats.invitationCount.value" class="badge">{{ chats.invitationCount.value }}</span></span></span>
        </NuxtLink>
      </li>
      <li><NuxtLink to="/contacts/new" class="row action-row"><span class="glyph"><AppIcon name="plus" /></span><span class="body">Create contact</span></NuxtLink></li>
      <li><NuxtLink to="/join" class="row action-row"><span class="glyph"><AppIcon name="key" /></span><span class="body">Join shared contact</span></NuxtLink></li>
    </ul>
    <div class="section-label">All contacts</div>
    <div v-if="loading && !chats.directory.value.length" class="center"><span class="spinner" /> Loading contacts…</div>
    <p v-if="error" class="notice">{{ error }}</p>
    <div v-if="!loading && !visible.length" class="empty">
      <p>{{ query ? 'No matching contacts.' : 'No contacts yet. Create one to start chatting.' }}</p>
    </div>
    <ul class="list">
      <li v-for="contact in visible" :key="contact.id">
        <NuxtLink :to="`/chats/${contact.id}`" class="row">
          <AppAvatar :name="contact.name" :path="contactPhotoPath(contact)" :size="40" />
          <span class="body">
            <span class="top"><strong>{{ contact.name }}</strong><span v-if="contact.role === 'member'" class="small muted">Shared</span></span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
