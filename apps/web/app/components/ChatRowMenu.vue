<script setup lang="ts">
// Right-click menu for a chat-list row: details, Archive/Unarchive, Clear chat and, for
// contacts, Delete. It reuses the session lifecycle mutations of the details pages.
const emit = defineEmits<{ error: [message: string] }>();
const chats = useChats();
const route = useRoute();
const menuID = useId();
const menu = ref<HTMLElement>();
const row = ref<ChatRow | null>(null);
const position = ref<{ top: number; left: number } | null>(null);
const clearing = ref<ChatRow | null>(null);
const busy = ref(false);

const detailsPath = computed(() => row.value?.kind === 'contact' ? `/contacts/${row.value.id}/edit` : `/groups/${row.value?.id}/members`);

// Opens at the cursor, clamped to the viewport. The keyboard context-menu key reports
// no pointer position, so the menu then opens below the row's leading edge.
async function show(target: ChatRow, event: MouseEvent) {
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const point = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : { x: rect.left + 16, y: rect.bottom };
  row.value = target;
  position.value = null;
  if (!menu.value?.matches(':popover-open')) menu.value?.showPopover();
  await nextTick();
  const panel = menu.value?.getBoundingClientRect();
  if (!panel) return;
  const margin = 8;
  position.value = {
    top: point.y + panel.height <= window.innerHeight - margin ? point.y : Math.max(margin, point.y - panel.height),
    left: Math.min(Math.max(margin, point.x), window.innerWidth - panel.width - margin),
  };
}
defineExpose({ show });
watch(() => route.path, () => menu.value?.hidePopover());

async function run(task: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  try { await task(); }
  catch (failure) { emit('error', errorMessage(failure)); }
  finally { busy.value = false; }
}

function act(action: (target: ChatRow) => void) {
  const target = row.value;
  menu.value?.hidePopover();
  if (target) action(target);
}
const archive = () => act((target) => run(() => chats.archiveChat(target.kind, target.id, !target.archived)));
const clear = () => act((target) => { clearing.value = target; });
function confirmClear(clearMemory: boolean) {
  const target = clearing.value;
  // The sheet closes either way, so a failure shows in the chat-list notice.
  if (target) void run(async () => {
    try { await chats.clearChat(target.kind, target.id, clearMemory); }
    finally { clearing.value = null; }
  });
}
const remove = () => act((target) => {
  const contact = chats.contacts.value.find((item) => item.id === target.id);
  if (!window.confirm(contactDeletionWarning(target.name, contact?.role !== 'member'))) return;
  void run(async () => {
    await chats.deleteChatContact(target.id);
    if (route.path.startsWith(`/chats/${target.id}`) || route.path.startsWith(`/contacts/${target.id}/`)) await navigateTo('/', { replace: true });
  });
});
</script>

<template>
  <div :id="menuID" ref="menu" popover="auto" class="chat-menu row-menu" :aria-label="row ? `${row.name} actions` : 'Chat actions'"
       :style="position ? { top: `${position.top}px`, left: `${position.left}px` } : { visibility: 'hidden' }" @contextmenu.prevent>
    <template v-if="row">
      <NuxtLink :to="detailsPath" class="row" @click="menu?.hidePopover()">
        <AppIcon name="info" />
        <span>{{ row.kind === 'contact' ? 'Contact details' : 'Group details' }}</span>
      </NuxtLink>
      <button type="button" class="row" data-ripple :disabled="busy" @click="archive">
        <AppIcon name="archive" />
        <span>{{ row.archived ? 'Unarchive' : 'Archive' }}</span>
      </button>
      <button v-if="row.canClear" type="button" class="row danger" data-ripple :disabled="busy" @click="clear">
        <AppIcon name="x-circle" />
        <span>Clear chat…</span>
      </button>
      <button v-if="row.canDelete" type="button" class="row danger" data-ripple :disabled="busy" @click="remove">
        <AppIcon name="delete" />
        <span>Delete contact…</span>
      </button>
    </template>
  </div>
  <AppSheet v-if="clearing" :title="`Clear ${clearing.name}`" @close="clearing = null">
    <ChatClearActions :busy="busy" :group="clearing.kind === 'group'" @clear="confirmClear" />
  </AppSheet>
</template>

<style scoped>
.row-menu { inset: auto; }
.row-menu .row { cursor: pointer; }
.row-menu .row svg { width: 24px; height: 24px; color: var(--md-on-surface-variant); flex: none; }
.row-menu .row.danger, .row-menu .row.danger svg { color: var(--md-error); }
</style>
