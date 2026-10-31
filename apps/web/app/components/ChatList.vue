<script setup lang="ts">
const chats = useChats();
const archived = ref(false);
const visibleRows = computed(() => archived.value ? chats.archivedRows.value : chats.rows.value);
const route = useRoute();
const menuID = useId();
const menu = ref<HTMLElement>();
const menuOpen = ref(false);
const rowMenu = ref<{ show: (row: ChatRow, event: MouseEvent) => void }>();
const actionError = ref<string | null>(null);

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
  <AppTopBar :title="archived ? 'Archived' : 'Chats'">
    <template #leading>
      <button class="icon-button" aria-label="Menu" title="Menu" :popovertarget="menuID"
              :aria-controls="menuID" :aria-expanded="menuOpen">
        <AppIcon name="menu" />
      </button>
      <nav :id="menuID" ref="menu" popover="auto" class="menu chat-menu" aria-label="Main navigation" @toggle="onMenuToggle">
        <AppMenuItem to="/updates" icon="sparkle" @click="menu?.hidePopover()">Updates</AppMenuItem>
        <AppMenuItem to="/account" icon="person" @click="menu?.hidePopover()">My account</AppMenuItem>
      </nav>
      <AppIconButton v-if="archived" icon="back" label="Back to Chats" @click="archived = false" />
    </template>
    <AppIconButton to="/updates" icon="sparkle" label="Updates" :selected="route.path === '/updates'" />
    <AppIconButton icon="archive" label="Archived" :selected="archived" @click="archived = !archived; chats.loadAllContacts()" />
    <AppIconButton to="/contacts" icon="plus" label="New chat" variant="filled"
                   :badge="chats.invitationCount.value" :badge-label="`${chats.invitationCount.value} pending invitations`" />
  </AppTopBar>
  <AppNotice v-if="actionError" dismissible @dismiss="actionError = null">{{ actionError }}</AppNotice>
  <AppNotice v-if="chats.error.value && visibleRows.length" tone="warning">
    {{ chats.error.value }}
    <template #actions><button class="link-button" @click="chats.refresh()">Retry</button></template>
  </AppNotice>
  <div class="scroll">
    <AppLoading v-if="!chats.loaded.value && !chats.error.value" label="Loading chats…" />
    <AppEmptyState v-else-if="chats.error.value && !visibleRows.length" icon="error" :text="chats.error.value">
      <template #actions><AppButton variant="tonal" icon="refresh" @click="chats.refresh()">Try again</AppButton></template>
    </AppEmptyState>
    <AppEmptyState v-else-if="!visibleRows.length" :icon="archived ? 'archive' : 'chat'"
                   :title="archived ? 'No archived chats' : 'No chats yet'" text="Open a contact to start a conversation.">
      <template #actions><AppButton to="/contacts" icon="plus">Open Contacts</AppButton></template>
    </AppEmptyState>
    <ul v-else class="list">
      <li v-for="row in visibleRows" :key="`${row.kind}/${row.id}`">
        <NuxtLink :to="rowPath(row)" class="row" data-ripple :class="{ active: route.path === rowPath(row), unread: row.unread }" @contextmenu="rowMenu?.show(row, $event)">
          <AppAvatar :name="row.name" :path="row.photoPath" :size="52" />
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
      <AppButton variant="text" @click="chats.loadMore()">Load older chats</AppButton>
    </div>
  </div>
  <ChatRowMenu ref="rowMenu" @error="message => actionError = message" />
</template>

<style scoped>
.preview-mic { display: inline-flex; vertical-align: -2px; margin-right: 4px; color: var(--md-on-surface-variant); }
.preview-mic.listened { color: var(--read); }
.preview-mic :deep(svg) { width: 16px; height: 16px; }
</style>
