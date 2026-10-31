<script setup lang="ts">
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
    <AppSearchField v-model="query" label="Search contacts" />
    <ul v-if="!query" class="list">
      <li><NuxtLink to="/groups/new" class="row action-row" data-ripple><span class="glyph"><AppIcon name="people" /></span><span class="body">Create group</span></NuxtLink></li>
      <li>
        <NuxtLink to="/invitations" class="row action-row" data-ripple>
          <span class="glyph"><AppIcon name="mail" /></span>
          <span class="body"><span class="top"><span class="grow">Invitations</span><span v-if="chats.invitationCount.value" class="badge">{{ chats.invitationCount.value }}</span></span></span>
        </NuxtLink>
      </li>
      <li><NuxtLink to="/contacts/new" class="row action-row" data-ripple><span class="glyph"><AppIcon name="plus" /></span><span class="body">Create contact</span></NuxtLink></li>
      <li><NuxtLink to="/join" class="row action-row" data-ripple><span class="glyph"><AppIcon name="key" /></span><span class="body">Join shared contact</span></NuxtLink></li>
    </ul>
    <div class="section-label">All contacts</div>
    <AppLoading v-if="loading && !chats.directory.value.length" label="Loading contacts…" />
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <AppEmptyState v-if="!loading && !visible.length" :icon="query ? 'search' : 'people'"
                   :text="query ? 'No matching contacts.' : 'No contacts yet. Create one to start chatting.'" />
    <ul class="list">
      <li v-for="contact in visible" :key="contact.id">
        <NuxtLink :to="`/chats/${contact.id}`" class="row" data-ripple>
          <AppAvatar :name="contact.name" :path="contactPhotoPath(contact)" :size="40" />
          <span class="body">
            <span class="top"><strong>{{ contact.name }}</strong><span v-if="contact.role === 'member'" class="small muted">Shared</span></span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
</style>
