<script setup lang="ts">
const route = useRoute();
const chats = useChats(() => {
  const path = route.path.replace(/\/$/, '');
  const id = String(route.params.id ?? '');
  if (path === `/chats/${id}`) return `contact/${id}`;
  if (path === `/groups/${id}`) return `group/${id}`;
  return null;
});
const archived = ref(false);
const visibleRows = computed(() => archived.value ? chats.archivedRows.value : chats.rows.value);
// On wide screens the navigation sidebar reaches For you and Account; phones use the header menu.
const wide = useWideLayout();
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
const updatesUnseen = updatesBadge();
usePolling(() => refreshUpdatesBadge(), () => 15_000);

// Progressive first circle (docs/onboarding.md#progressive-setup): follow it while contacts are created.
const onboarding = useOnboarding();
const creatingCircle = computed(() => !archived.value && circleRunning(onboarding.snapshot.value));
const circleFailed = computed(() => !archived.value && onboarding.snapshot.value?.status === 'failed');
// Before the identities exist, placeholders stand in for the five contacts.
const placeholders = computed(() => creatingCircle.value && !chats.rows.value.some(row => row.setupPending) && !(onboarding.snapshot.value?.photoCount) ? 5 : 0);
const retryingCircle = ref(false);
async function retryCircle() {
  retryingCircle.value = true;
  try { await onboarding.retry(); } catch (failure) { actionError.value = errorMessage(failure); }
  finally { retryingCircle.value = false; }
}
usePolling(() => creatingCircle.value ? onboarding.refreshStatus() : Promise.resolve(), () => 3000);
onMounted(() => { if (!onboarding.snapshot.value || creatingCircle.value) void onboarding.refreshStatus(); });
onMounted(() => { void chats.refresh(); });
</script>

<template>
  <AppTopBar :title="archived ? $t('chat.list.archived') : $t('chat.list.title')">
    <template #leading>
      <button v-if="!wide" class="icon-button" :aria-label="$t('chat.list.menu')" :title="$t('chat.list.menu')" :popovertarget="menuID"
              :aria-controls="menuID" :aria-expanded="menuOpen">
        <AppIcon name="menu" />
      </button>
      <nav v-if="!wide" :id="menuID" ref="menu" popover="auto" class="menu chat-menu" :aria-label="$t('chat.list.mainNavigation')" @toggle="onMenuToggle">
        <AppMenuItem to="/updates" icon="home" @click="menu?.hidePopover()">{{ $t('chat.list.forYou') }}<span v-if="updatesUnseen" class="badge" style="margin-inline-start: auto" :aria-label="$t('chat.list.newCount', updatesUnseen)">{{ updatesUnseen }}</span></AppMenuItem>
        <AppMenuItem to="/account" icon="person" @click="menu?.hidePopover()">{{ $t('chat.list.myAccount') }}</AppMenuItem>
      </nav>
      <AppIconButton v-if="archived" icon="back" :label="$t('chat.list.backToChats')" @click="archived = false" />
    </template>
    <AppIconButton v-if="!wide" to="/updates" icon="home" :label="$t('chat.list.forYou')"
                   :badge="updatesUnseen" :badge-label="$t('chat.list.newInForYou', updatesUnseen)" />
    <AppIconButton icon="archive" :label="$t('chat.list.archived')" :selected="archived" @click="archived = !archived; chats.loadAllContacts()" />
    <AppIconButton to="/contacts" icon="plus" :label="$t('chat.list.newChat')" variant="filled"
                   :badge="chats.invitationCount.value" :badge-label="$t('chat.list.pendingInvitations', chats.invitationCount.value)" />
  </AppTopBar>
  <AppNotice v-if="actionError" dismissible @dismiss="actionError = null">{{ actionError }}</AppNotice>
  <AppNotice v-if="chats.error.value && visibleRows.length" tone="warning">
    {{ chats.error.value }}
    <template #actions><button class="link-button" @click="chats.refresh()">{{ $t('common.retry') }}</button></template>
  </AppNotice>
  <AppNotice v-if="creatingCircle" class="circle-progress">
    <span class="spinner" aria-hidden="true" />
    {{ $t('chat.list.creatingCircle', { count: onboarding.snapshot.value?.photoCount ?? 0, total: 5 }) }}
  </AppNotice>
  <AppNotice v-else-if="circleFailed" tone="warning">
    {{ $t('chat.list.circleFailed') }}
    <template #actions><button class="link-button" :disabled="retryingCircle" @click="retryCircle">{{ $t('common.retry') }}</button></template>
  </AppNotice>
  <div class="scroll">
    <ul v-if="placeholders" class="list" :aria-label="$t('chat.list.contactsBeingCreated')">
      <li v-for="n in placeholders" :key="n">
        <div class="row pending" aria-disabled="true">
          <AppAvatar name="" :path="null" :size="52" />
          <div class="body"><div class="top"><strong>{{ $t('chat.list.newContact') }}</strong></div><div class="bottom"><span class="preview">{{ $t('chat.list.creating') }}</span></div></div>
        </div>
      </li>
    </ul>
    <AppLoading v-if="!chats.loaded.value && !chats.error.value && !placeholders" :label="$t('chat.list.loading')" />
    <AppEmptyState v-else-if="chats.error.value && !visibleRows.length" icon="error" :text="chats.error.value">
      <template #actions><AppButton variant="tonal" icon="refresh" @click="chats.refresh()">{{ $t('common.tryAgain') }}</AppButton></template>
    </AppEmptyState>
    <AppEmptyState v-else-if="!visibleRows.length && !placeholders" :icon="archived ? 'archive' : 'chat'"
                   :title="archived ? $t('chat.list.emptyArchived') : $t('chat.list.empty')" :text="$t('chat.list.emptyText')">
      <template #actions><AppButton to="/contacts" icon="plus">{{ $t('chat.list.openContacts') }}</AppButton></template>
    </AppEmptyState>
    <ul v-else class="list">
      <li v-for="row in visibleRows" :key="`${row.kind}/${row.id}`">
        <div v-if="row.setupPending" class="row pending" aria-disabled="true" :aria-label="$t('chat.list.beingCreated', { name: row.name })">
          <AppAvatar :name="row.name" :path="row.photoPath" :size="52" />
          <div class="body">
            <div class="top"><strong>{{ row.name }}</strong></div>
            <div class="bottom"><span class="preview"><span class="spinner small" aria-hidden="true" /> {{ $t('chat.list.creating') }}</span></div>
          </div>
        </div>
        <NuxtLink v-else :to="rowPath(row)" class="row" data-ripple :class="{ active: route.path === rowPath(row), unread: row.unread }" @contextmenu="rowMenu?.show(row, $event)">
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
                  role="img" :aria-label="(row.own ? row.voice.listenedAt != null : row.voice.ownListenedAt != null) ? $t('chat.list.listened') : $t('chat.list.notListened')"><AppIcon name="mic" filled /></span>
                <b v-if="row.sender" :class="{ 'draft-label': row.draft }">{{ row.sender }}: </b>{{ row.preview }}
              </span>
              <span v-if="row.unread" class="badge" :aria-label="$t('chat.list.unread', { count: row.unread })">{{ row.unread }}</span>
            </div>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <div v-if="chats.nextCursor.value" class="center">
      <AppButton variant="text" @click="chats.loadMore()">{{ $t('chat.list.loadOlder') }}</AppButton>
    </div>
  </div>
  <ChatRowMenu ref="rowMenu" @error="message => actionError = message" />
</template>

<style scoped>
.row.pending { opacity: 0.55; cursor: default; }
.spinner.small { display: inline-block; width: 12px; height: 12px; vertical-align: -1px; margin-right: 4px; }
.circle-progress .spinner { display: inline-block; width: 16px; height: 16px; vertical-align: -3px; margin-right: var(--space-2); }
.preview-mic { display: inline-flex; vertical-align: -2px; margin-right: 4px; color: var(--md-on-surface-variant); }
.preview-mic.listened { color: var(--read); }
.preview-mic :deep(svg) { width: 16px; height: 16px; }
.draft-label { color: var(--md-primary); }
.row.active .draft-label { color: inherit; }
</style>
