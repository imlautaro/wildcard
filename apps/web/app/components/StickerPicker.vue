<script setup lang="ts">
import type { Sticker } from '~/utils/types';

// Sticker picker (docs/stickers.md#web): My stickers (tap sends, "…" or long-press opens the
// sticker's actions) and, in private chats, the contact's stickers (tap saves). Built on
// AppSheet, so it is a bottom sheet on narrow screens and a dialog otherwise, with focus kept
// inside, Escape and backdrop dismissal, and focus restored to the opening button by <dialog>.
// Lists come from the session cache (useStickers): reopening shows them at once.
const props = defineProps<{ contactID?: string | null; contactName?: string | null }>();
const emit = defineEmits<{ close: []; pick: [sticker: Sticker]; create: [] }>();

const { t } = useI18n();
const stickers = useStickers();
const { library } = stickers;
type Mode = { kind: 'grid' } | { kind: 'actions' | 'emoji' | 'delete'; sticker: Sticker };
const tab = ref<'mine' | 'contact'>('mine');
const mode = ref<Mode>({ kind: 'grid' });
const busy = ref<string[]>([]);
const problem = ref<string | null>(null);
const emoji = ref('');
const contact = computed(() => props.contactID ? stickers.contactList(props.contactID) : null);
const tabs = computed(() => [{ value: 'mine' as const, label: t('chat.stickers.mine') }, { value: 'contact' as const, label: props.contactName?.trim() || t('chat.contactFallback') }]);
const current = computed(() => tab.value === 'contact' && contact.value ? contact.value : library);
const title = computed(() => mode.value.kind === 'grid' ? t('chat.stickers.title') : t('chat.stickers.detailTitle'));
const full = computed(() => library.limit !== null && library.items.length >= library.limit);

function load(force = false) {
  void stickers.refreshLibrary(force);
  if (props.contactID) void stickers.refreshContact(props.contactID, force);
}
onMounted(() => load());
watch(tab, () => { problem.value = null; load(); });
// Another account must never see this picker.
watch(() => useSession().user.value?.id, () => emit('close'));

function back() { mode.value = { kind: 'grid' }; problem.value = null; }
// Escape or a backdrop press steps back from a sticker's actions before it closes the sheet.
function dismiss() {
  if (mode.value.kind !== 'grid') back();
  else emit('close');
}
async function run(id: string, action: () => Promise<void>) {
  if (busy.value.includes(id)) return;
  busy.value = [...busy.value, id];
  problem.value = null;
  try { await action(); }
  catch (failure) { problem.value = errorMessage(failure); }
  finally { busy.value = busy.value.filter((value) => value !== id); }
}

// Long-press (touch) and the context menu (mouse) open a sticker's actions, like the "…" button.
let pressTimer: ReturnType<typeof setTimeout> | undefined;
let held = false;
function press(event: PointerEvent, sticker: Sticker) {
  held = false;
  if (event.pointerType === 'mouse') return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => { held = true; mode.value = { kind: 'actions', sticker }; }, 500);
}
const release = () => clearTimeout(pressTimer);
function choose(sticker: Sticker) {
  if (held) { held = false; return; }
  emit('pick', sticker);
}
onBeforeUnmount(release);

function saveContactSticker(sticker: Sticker) {
  if (!props.contactID || stickers.hasDigest(sticker.digest)) return;
  const contactID = props.contactID;
  void run(sticker.id, async () => { await stickers.saveFromContact(contactID, sticker); });
}
function startEmoji(sticker: Sticker) { emoji.value = sticker.emoji; mode.value = { kind: 'emoji', sticker }; }
function saveEmoji(sticker: Sticker) {
  const value = emoji.value;
  void run(sticker.id, async () => { await stickers.setEmoji(sticker, value); back(); });
}
function confirmDelete(sticker: Sticker) {
  void run(sticker.id, async () => { await stickers.remove(sticker); back(); });
}
const isBusy = (sticker: Sticker) => busy.value.includes(sticker.id);
// The sticker being edited may disappear (another device, or a refresh); return to the grid.
watch(() => library.items, (items) => {
  const open = mode.value;
  if (open.kind !== 'grid' && !items.some((item) => item.id === open.sticker.id)) back();
});
</script>

<template>
  <AppSheet :title="title" wide @close="dismiss">
    <template v-if="mode.kind === 'grid'">
      <AppSegmented v-if="contactID" v-model="tab" :options="tabs" :label="$t('chat.stickers.library')" class="sticker-tabs" />
      <AppNotice v-if="problem" dismissible @dismiss="problem = null">{{ problem }}</AppNotice>
      <AppNotice v-if="current.error" :tone="current.loaded ? 'warning' : 'error'">
        {{ current.error }}
        <template #actions><button type="button" class="link-button" @click="load(true)">{{ $t('common.retry') }}</button></template>
      </AppNotice>
      <AppLoading v-else-if="!current.loaded" :label="$t('chat.stickers.loading')" />
      <ul v-if="current.loaded || tab === 'mine'" class="sticker-grid" :aria-label="tab === 'mine' ? $t('chat.stickers.mine') : $t('chat.stickers.contactStickers', { name: contactName ?? $t('chat.contactFallback') })">
        <li v-if="tab === 'mine'">
          <button type="button" class="sticker-create" :disabled="full" :aria-label="full ? $t('chat.stickers.createFull') : $t('chat.stickers.create')" @click="emit('create')">
            <AppIcon name="plus" /><span>{{ $t('chat.stickers.create') }}</span>
          </button>
        </li>
        <template v-if="tab === 'mine'">
          <li v-for="sticker in library.items" :key="sticker.id" class="sticker-tile">
            <button
              type="button" class="sticker-button" :aria-label="$t('chat.stickers.send', { emoji: sticker.emoji })" @click="choose(sticker)"
              @pointerdown="press($event, sticker)" @pointerup="release" @pointercancel="release" @pointermove="release" @contextmenu.prevent="mode = { kind: 'actions', sticker }"
            >
              <StickerImage :path="stickerImagePath(sticker)" :emoji="sticker.emoji" />
              <span class="sticker-emoji" aria-hidden="true">{{ sticker.emoji }}</span>
            </button>
            <AppIconButton class="sticker-more" icon="more" size="small" :label="$t('chat.stickers.actionsFor', { emoji: sticker.emoji })" @click="mode = { kind: 'actions', sticker }" />
          </li>
        </template>
        <template v-else-if="contactID && contact">
          <li v-for="sticker in contact.items" :key="sticker.id" class="sticker-tile">
            <button
              type="button" class="sticker-button" :disabled="stickers.hasDigest(sticker.digest) || isBusy(sticker)"
              :aria-label="stickers.hasDigest(sticker.digest) ? $t('chat.stickers.savedLabel', { emoji: sticker.emoji }) : $t('chat.stickers.saveLabel', { emoji: sticker.emoji })"
              @click="saveContactSticker(sticker)"
            >
              <StickerImage :path="contactStickerImagePath(contactID, sticker)" :emoji="sticker.emoji" />
              <span class="sticker-emoji" aria-hidden="true">{{ sticker.emoji }}</span>
              <span v-if="isBusy(sticker)" class="sticker-state"><span class="spinner" aria-hidden="true" /></span>
              <span v-else-if="stickers.hasDigest(sticker.digest)" class="sticker-state saved"><AppIcon name="check" filled /><span>{{ $t('chat.stickers.saved') }}</span></span>
              <span v-else class="sticker-state save"><AppIcon name="plus" /><span>{{ $t('chat.stickers.save') }}</span></span>
            </button>
          </li>
        </template>
      </ul>
      <p v-if="tab === 'mine' && library.loaded && !library.items.length" class="sticker-empty">
        {{ contactID ? $t('chat.stickers.emptyMineContact', { name: contactName ?? $t('chat.stickers.yourContact') }) : $t('chat.stickers.emptyMine') }}
      </p>
      <p v-else-if="tab === 'contact' && contact?.loaded && !contact.items.length" class="sticker-empty">
        {{ $t('chat.stickers.emptyContact', { name: contactName ?? $t('chat.stickers.thisContact') }) }}
      </p>
      <p v-if="tab === 'mine' && library.limit !== null" class="sticker-count small muted">{{ $t('chat.stickers.count', { count: library.items.length, limit: library.limit }) }}</p>
    </template>

    <template v-else>
      <div class="sticker-detail"><StickerImage :path="stickerImagePath(mode.sticker)" :emoji="mode.sticker.emoji" /></div>
      <AppNotice v-if="problem" dismissible @dismiss="problem = null">{{ problem }}</AppNotice>
      <div v-if="mode.kind === 'actions'" class="menu sticker-actions" role="group" :aria-label="$t('chat.stickers.actions')">
        <AppMenuItem icon="sparkle" @click="startEmoji(mode.sticker)">{{ $t('chat.stickers.changeEmoji', { emoji: mode.sticker.emoji }) }}</AppMenuItem>
        <AppMenuItem icon="delete" danger @click="mode = { kind: 'delete', sticker: mode.sticker }">{{ $t('common.delete') }}</AppMenuItem>
      </div>
      <StickerEmojiPicker v-else-if="mode.kind === 'emoji'" v-model="emoji" />
      <p v-else class="sticker-empty">{{ $t('chat.stickers.deleteConfirm') }}</p>
    </template>

    <template v-if="mode.kind !== 'grid'" #actions>
      <AppButton variant="text" @click="back">{{ $t('common.back') }}</AppButton>
      <AppButton v-if="mode.kind === 'emoji'" :loading="isBusy(mode.sticker)" :disabled="!emoji || emoji === mode.sticker.emoji" @click="saveEmoji(mode.sticker)">{{ $t('chat.stickers.saveEmoji') }}</AppButton>
      <AppButton v-else-if="mode.kind === 'delete'" variant="danger" :loading="isBusy(mode.sticker)" @click="confirmDelete(mode.sticker)">{{ $t('common.delete') }}</AppButton>
    </template>
  </AppSheet>
</template>

<style scoped>
.sticker-tabs { margin-bottom: var(--space-3); }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--space-2); margin: 0 0 var(--space-3); padding: 0; list-style: none; }
.sticker-tile { position: relative; }
.sticker-button, .sticker-create {
  position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; aspect-ratio: 1; padding: var(--space-2);
  border: 0; border-radius: var(--md-shape-l); background: var(--md-surface-container-highest); color: inherit; cursor: pointer; overflow: hidden;
  -webkit-touch-callout: none; user-select: none; -webkit-user-select: none;
}
.sticker-create { gap: var(--space-1); background: var(--md-secondary-container); color: var(--md-on-secondary-container); font: var(--type-label-medium); text-align: center; }
.sticker-create svg { width: 28px; height: 28px; }
.sticker-create:disabled, .sticker-button:disabled { cursor: default; }
.sticker-create:disabled { opacity: 0.5; }
.sticker-button:hover:not(:disabled) { background: color-mix(in srgb, var(--md-on-surface) 12%, var(--md-surface-container-highest)); }
.sticker-emoji { position: absolute; left: var(--space-1); bottom: var(--space-0-5); font-size: 14px; line-height: 1; }
.sticker-more { position: absolute; top: 0; right: 0; }
.sticker-state { position: absolute; right: var(--space-1); bottom: var(--space-1); display: inline-flex; align-items: center; gap: 2px; padding: 2px var(--space-1-5); border-radius: var(--md-shape-full); font: var(--type-label-small); background: var(--md-primary); color: var(--md-on-primary); }
.sticker-state.saved { background: var(--md-secondary-container); color: var(--md-on-secondary-container); }
.sticker-state svg { width: 14px; height: 14px; }
.sticker-empty { margin: 0 0 var(--space-3); color: var(--md-on-surface-variant); text-align: center; }
.sticker-count { margin: 0; text-align: center; }
.sticker-detail { width: 160px; height: 160px; margin: 0 auto var(--space-3); }
.sticker-actions { box-shadow: none; animation: none; background: var(--md-surface-container-highest); }
</style>
