<script setup lang="ts">
const chats = useChats();
const archived = ref(false);
const visibleRows = computed(() => archived.value ? chats.archivedRows.value : chats.rows.value);
const route = useRoute();
const menuID = useId();
const menu = ref<HTMLElement>();
const menuOpen = ref(false);

function onMenuToggle() {
  menuOpen.value = menu.value?.matches(':popover-open') ?? false;
}
watch(() => route.path, () => menu.value?.hidePopover());

function rowPath(row: ChatRow) {
  return row.kind === 'contact' ? `/chats/${row.id}` : `/groups/${row.id}`;
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
    <button class="icon-button" aria-label="Menu" title="Menu" :popovertarget="menuID"
            :aria-controls="menuID" :aria-expanded="menuOpen">
      <AppIcon name="menu" />
    </button>
    <nav :id="menuID" ref="menu" popover="auto" class="chat-menu" aria-label="Main navigation" @toggle="onMenuToggle">
      <NuxtLink to="/home" class="row" @click="menu?.hidePopover()">
        <AppIcon name="home" />
        <span>Home</span>
      </NuxtLink>
      <NuxtLink to="/account" class="row" @click="menu?.hidePopover()">
        <AppIcon name="person" />
        <span>My account</span>
      </NuxtLink>
    </nav>
    <button v-if="archived" class="icon-button" aria-label="Back to Chats" title="Back to Chats" @click="archived=false">
      <AppIcon name="back" />
    </button>
    <h1 class="title">{{ archived ? 'Archived' : 'Chats' }}</h1>
    <NuxtLink to="/home" class="icon-button home-link" aria-label="Home" title="Home" :class="{ active: route.path === '/' || route.path === '/home' }">
      <AppIcon name="home" :filled="route.path === '/' || route.path === '/home'" />
    </NuxtLink>
    <button class="icon-button" aria-label="Archived" title="Archived" :aria-pressed="archived" @click="archived=!archived; chats.loadAllContacts()">
      <AppIcon name="archive" :filled="archived" />
    </button>
    <NuxtLink to="/contacts" class="icon-button primary" aria-label="New chat" title="New chat">
      <AppIcon name="plus" />
      <span v-if="chats.invitationCount.value" class="badge" :aria-label="`${chats.invitationCount.value} pending invitations`">{{ chats.invitationCount.value }}</span>
    </NuxtLink>
  </header>
  <div v-if="chats.error.value && visibleRows.length" class="notice" role="status">
    {{ chats.error.value }}
    <button class="link-button" @click="chats.refresh()">Retry</button>
  </div>
  <div class="scroll">
    <div v-if="!chats.loaded.value && !chats.error.value" class="center"><span class="spinner" /> Loading chats…</div>
    <div v-else-if="chats.error.value && !visibleRows.length" class="empty">
      <p>{{ chats.error.value }}</p>
      <button class="button secondary" @click="chats.refresh()">Try again</button>
    </div>
    <div v-else-if="!visibleRows.length" class="empty">
      <h2>{{ archived ? 'No archived chats' : 'No chats yet' }}</h2>
      <p>Open a contact to start a conversation.</p>
      <NuxtLink to="/contacts" class="button">Open Contacts</NuxtLink>
    </div>
    <ul v-else class="list">
      <li v-for="row in visibleRows" :key="`${row.kind}/${row.id}`">
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
                <span v-if="row.voice" class="preview-mic" :class="{ listened: row.own ? row.voice.listenedAt != null : row.voice.ownListenedAt != null }"
                  role="img" :aria-label="(row.own ? row.voice.listenedAt != null : row.voice.ownListenedAt != null) ? 'Listened' : 'Not listened yet'"><AppIcon name="mic" filled /></span>
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
</template>

<style scoped>
.preview-mic { display: inline-flex; vertical-align: -2px; margin-right: 4px; color: var(--md-on-surface-variant); }
.preview-mic.listened { color: var(--read); }
.preview-mic :deep(svg) { width: 16px; height: 16px; }
</style>
