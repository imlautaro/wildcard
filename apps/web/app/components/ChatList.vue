<script setup lang="ts">
const chats = useChats();
const { user } = useSession();
const route = useRoute();

function rowPath(row: ChatRow) {
  return row.kind === 'contact' ? `/chats/${row.id}` : `/groups/${row.id}`;
}
function accountPhotoPath() {
  return user.value?.photoVersion ? `me/photo?version=${encodeURIComponent(user.value.photoVersion)}` : null;
}

// Same cadence as the iOS session synchronizer: lists every second while
// visible (failed read acknowledgements retry on the same tick), invitations every 15 s.
usePolling(async () => {
  retryPendingReads();
  await chats.refreshLists();
}, () => 1000);
usePolling(() => chats.refreshInvitations(), () => 15_000);
onMounted(() => { void chats.refresh(); });
</script>

<template>
  <header class="bar">
    <h1 class="title">Chats</h1>
    <NuxtLink to="/account" class="icon-button" aria-label="Account">
      <AppAvatar :name="user?.name ?? ''" :path="accountPhotoPath()" :size="32" />
    </NuxtLink>
  </header>
  <div v-if="chats.error.value && chats.rows.value.length" class="notice" role="status">
    {{ chats.error.value }}
    <button class="link-button" @click="chats.refresh()">Retry</button>
  </div>
  <div class="scroll">
    <div v-if="!chats.loaded.value && !chats.error.value" class="center"><span class="spinner" /> Loading chats…</div>
    <div v-else-if="chats.error.value && !chats.rows.value.length" class="empty">
      <p>{{ chats.error.value }}</p>
      <button class="button secondary" @click="chats.refresh()">Try again</button>
    </div>
    <div v-else-if="!chats.rows.value.length" class="empty">
      <h2>No chats yet</h2>
      <p>Open a contact to start a conversation.</p>
      <NuxtLink to="/contacts" class="button">Open Contacts</NuxtLink>
    </div>
    <ul v-else class="list">
      <li v-for="row in chats.rows.value" :key="`${row.kind}/${row.id}`">
        <NuxtLink :to="rowPath(row)" class="row" :class="{ active: route.path === rowPath(row), unread: row.unread }">
          <AppAvatar :name="row.name" :path="row.photoPath" :size="48" />
          <div class="body">
            <div class="top">
              <strong>{{ row.name }}</strong>
              <time :datetime="new Date(row.at).toISOString()">{{ listDate(row.at) }}</time>
            </div>
            <div class="bottom">
              <span class="preview">
                <MessageReceipt v-if="row.own" :sending="row.sending" :read-at="row.readAt" :receipt-state="row.receiptState" />
                <b v-if="row.sender">{{ row.sender }}: </b>{{ row.preview }}
              </span>
              <span v-if="row.unread" class="badge" :aria-label="`${row.unread} unread`">{{ row.unread }}</span>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <div v-if="chats.nextCursor.value" class="center">
      <button class="link-button" @click="chats.loadMore()">Load older chats</button>
    </div>
  </div>
  <NuxtLink to="/contacts" class="fab" aria-label="Contacts and new chat">
    <AppIcon name="compose" />New chat
    <span v-if="chats.invitationCount.value" class="badge">{{ chats.invitationCount.value }}</span>
  </NuxtLink>
</template>
