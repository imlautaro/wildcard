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
  <PageBar :title="$t('contacts.index.title')" />
  <div class="scroll">
    <AppSearchField v-model="query" :label="$t('contacts.index.search')" />
    <ul v-if="!query" class="list">
      <li><NuxtLink to="/groups/new" class="row action-row" data-ripple><span class="glyph"><AppIcon name="people" /></span><span class="body">{{ $t('contacts.index.createGroup') }}</span></NuxtLink></li>
      <li>
        <NuxtLink to="/invitations" class="row action-row" data-ripple>
          <span class="glyph"><AppIcon name="mail" /></span>
          <span class="body"><span class="top"><span class="grow">{{ $t('contacts.index.invitations') }}</span><span v-if="chats.invitationCount.value" class="badge">{{ chats.invitationCount.value }}</span></span></span>
        </NuxtLink>
      </li>
      <li><NuxtLink to="/contacts/new" class="row action-row" data-ripple><span class="glyph"><AppIcon name="plus" /></span><span class="body">{{ $t('contacts.index.createContact') }}</span></NuxtLink></li>
      <li><NuxtLink to="/join" class="row action-row" data-ripple><span class="glyph"><AppIcon name="key" /></span><span class="body">{{ $t('contacts.index.joinShared') }}</span></NuxtLink></li>
    </ul>
    <div class="section-label">{{ $t('contacts.index.all') }}</div>
    <AppLoading v-if="loading && !chats.directory.value.length" :label="$t('contacts.index.loading')" />
    <AppNotice v-if="error">{{ error }}</AppNotice>
    <AppEmptyState v-if="!loading && !visible.length" :icon="query ? 'search' : 'people'"
                   :text="query ? $t('contacts.index.noMatches') : $t('contacts.index.empty')" />
    <ul class="list">
      <li v-for="contact in visible" :key="contact.id">
        <div v-if="contact.setupPending === 1" class="row" aria-disabled="true" style="opacity: 0.55">
          <AppAvatar :name="contact.name" :path="contactPhotoPath(contact)" :size="40" />
          <span class="body"><span class="top"><strong>{{ contact.name }}</strong><span class="small muted">{{ $t('contacts.index.creating') }}</span></span></span>
        </div>
        <NuxtLink v-else :to="`/chats/${contact.id}`" class="row" data-ripple>
          <AppAvatar :name="contact.name" :path="contactPhotoPath(contact)" :size="40" />
          <span class="body">
            <span class="top"><strong>{{ contact.name }}</strong><span v-if="contact.role === 'member'" class="small muted">{{ $t('contacts.index.shared') }}</span></span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.grow { flex: 1; }
</style>
