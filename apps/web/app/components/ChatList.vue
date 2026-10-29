<script setup lang="ts">
const chats = useChats();
const archived = ref(false);
const action = ref<ChatRow | null>(null);
const clearingMemory = ref(false);
const busy = ref(false);
const mutationError = ref<string | null>(null);
const visibleRows = computed(()=>archived.value ? chats.archivedRows.value : chats.rows.value);
async function mutate(operation:()=>Promise<void>) {
  if (busy.value) return;
  busy.value = true; mutationError.value = null;
  try { await operation(); action.value = null; }
  catch (error) { mutationError.value = errorMessage(error); }
  finally { busy.value = false; }
}
function clear(row: ChatRow) {
  const scope = row.kind==='group' ? 'for everyone in this group' : 'from your private chat';
  if (!window.confirm(`Permanently clear all messages, files, tasks, documents, mini apps, and scheduled work ${scope}? ${clearingMemory.value ? 'Memory learned here will also be deleted.' : 'Extracted memories will be kept without the original messages.'}`)) return;
  void mutate(()=>chats.clearChat(row.kind,row.id,clearingMemory.value));
}
function deleteContact(row: ChatRow) {
  const contact = chats.contacts.value.find(item=>item.id===row.id);
  const scope = contact?.role==='member' ? 'your access and private data. Other participants keep the contact' : 'the contact and all participants’ private chats and memories, plus its group messages and work';
  if (!window.confirm(`Permanently delete ${scope}? This cannot be undone.`)) return;
  void mutate(()=>chats.deleteChatContact(row.id));
}
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
    <h1 class="title">{{ archived ? 'Archived' : 'Chats' }}</h1>
    <NuxtLink to="/account" class="icon-button" aria-label="Account">
      <AppAvatar :name="user?.name ?? ''" :path="accountPhotoPath()" :size="32" />
    </NuxtLink>
  </header>
  <div v-if="chats.error.value && visibleRows.length" class="notice" role="status">
    {{ chats.error.value }}
    <button class="link-button" @click="chats.refresh()">Retry</button>
  </div>
  <div v-if="mutationError" class="notice" role="alert">{{ mutationError }}</div>
  <div class="scroll">
    <button class="row link-button" @click="archived=!archived; chats.loadAllContacts()">{{ archived ? 'Back to Chats' : `Archived (${chats.archivedRows.value.length})` }}</button>
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
                <b v-if="row.sender">{{ row.sender }}: </b>{{ row.preview }}
              </span>
              <span v-if="row.unread" class="badge" :aria-label="`${row.unread} unread`">{{ row.unread }}</span>
            </div>
          </div>
        </NuxtLink>
        <button class="link-button chat-actions" :aria-label="`Manage ${row.name}`" :disabled="busy" @click="action=row; clearingMemory=false">Manage</button>
      </li>
    </ul>
    <div v-if="chats.nextCursor.value" class="center">
      <button class="link-button" @click="chats.loadMore()">Load older chats</button>
    </div>
  </div>
  <div v-if="action" class="lifecycle-backdrop" @click.self="!busy && (action=null)">
    <section role="dialog" aria-modal="true" :aria-label="`Manage ${action.name}`" class="lifecycle-dialog">
      <h2>{{ action.name }}</h2>
      <button class="button secondary" :disabled="busy" @click="mutate(()=>chats.archiveChat(action!.kind,action!.id,!action!.archived))">{{ action.archived ? 'Unarchive' : 'Archive' }}</button>
      <template v-if="action.canClear">
        <p>{{ action.kind==='group' ? 'Clear the group for everyone.' : 'Clear your private conversation.' }} This also removes files, tasks, documents, mini apps, and scheduled work.</p>
        <label><input v-model="clearingMemory" type="checkbox" :disabled="busy"> Also delete memory learned in this chat</label>
        <button class="button secondary" :disabled="busy" @click="clear(action)">Clear chat</button>
      </template>
      <button v-if="action.canDelete" class="button secondary" :disabled="busy" @click="deleteContact(action)">Delete contact and data</button>
      <button class="link-button" :disabled="busy" @click="action=null">Cancel</button>
    </section>
  </div>
  <NuxtLink to="/contacts" class="fab" aria-label="Contacts and new chat">
    <AppIcon name="compose" />New chat
    <span v-if="chats.invitationCount.value" class="badge">{{ chats.invitationCount.value }}</span>
  </NuxtLink>
</template>

<style scoped>
.chat-actions { margin: 0 16px 8px 76px; }
.lifecycle-backdrop { position: fixed; inset: 0; z-index: 100; background: #0006; display: grid; place-items: center; padding: 24px; }
.lifecycle-dialog { background: var(--surface, Canvas); color: var(--text, CanvasText); padding: 24px; border-radius: 20px; display: grid; gap: 16px; width: min(100%, 420px); max-height: 90dvh; overflow: auto; }
</style>
