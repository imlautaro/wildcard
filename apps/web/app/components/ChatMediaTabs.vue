<script setup lang="ts">
import type { ChatMediaItem } from '~/utils/types';
import type { ChatMediaKind } from '~/composables/useChatMedia';

// WhatsApp-style chat details tabs: an image grid and a list of shared files.
// `base` is the chat's API prefix (`contacts/:id/chat` or `groups/:id`).
const props = defineProps<{ base: string; attachmentPath: (item: ChatMediaItem) => string; documentsBase: string; documentRoute: string }>();
// The Docs tab lists contact-authored Markdown documents first, then shared files.
const documents = useDocuments(() => props.documentsBase);
const creating = ref(false);
async function newDocument() {
  const title = window.prompt('Document title');
  if (!title?.trim() || creating.value) return;
  creating.value = true;
  try { await navigateTo(`${props.documentRoute}/${await documents.create(title.trim())}`); }
  catch (failure) { window.alert(errorMessage(failure)); }
  finally { creating.value = false; }
}
const tab = ref<ChatMediaKind>('image');
const { state, load } = useChatMedia(() => props.base, tab);
watch([() => props.base, tab], () => { load(); if (tab.value === 'file') documents.refresh(); }, { immediate: true });
</script>

<template>
  <div class="group-title">Shared in this chat</div>
  <div class="segmented" role="group" aria-label="Shared in this chat">
    <button type="button" :aria-pressed="tab === 'image'" @click="tab = 'image'">Media</button>
    <button type="button" :aria-pressed="tab === 'file'" @click="tab = 'file'">Docs</button>
  </div>
  <template v-if="tab === 'file'">
    <div class="group">
      <NuxtLink v-for="doc in documents.state.value.items" :key="doc.id" :to="`${documentRoute}/${doc.id}`" class="mini-row" style="color: inherit">
        <span class="mini-app-glyph"><AppIcon name="file" /></span>
        <span class="copy"><strong>{{ doc.title }}</strong><span>{{ doc.updatedByName }} · {{ dayLabel(doc.updatedAt) }}</span></span>
        <AppIcon name="chevron" class="chevron" style="width: 20px; height: 20px; color: var(--secondary)" />
      </NuxtLink>
      <button type="button" class="button-row" :disabled="creating" @click="newDocument"><AppIcon name="plus" />New document</button>
    </div>
    <div class="group-title">Files</div>
  </template>
  <div v-if="!state.loaded && state.request" class="center"><span class="spinner" /> Loading…</div>
  <div v-else-if="!state.loaded && state.error" class="group">
    <div class="text-block">{{ state.error }}</div>
    <button type="button" class="button-row" @click="load(false, true)"><AppIcon name="refresh" />Try again</button>
  </div>
  <template v-else-if="state.loaded">
    <div v-if="!state.items.length" class="group"><div class="text-block">{{ tab === 'image' ? 'No photos in this chat yet.' : 'No files in this chat yet.' }}</div></div>
    <div v-else-if="tab === 'image'" class="media-grid">
      <ChatMediaThumb v-for="item in state.items" :key="chatMediaItemKey(item)" :name="item.name" :path="attachmentPath(item)" />
    </div>
    <div v-else class="group">
      <div v-for="item in state.items" :key="chatMediaItemKey(item)" class="field media-file">
        <MessageAttachment :attachment="item" :path="attachmentPath(item)" />
        <span class="small muted">{{ item.senderName ? `${item.senderName} · ` : '' }}{{ dayLabel(item.createdAt) }}</span>
      </div>
    </div>
    <button v-if="state.nextBefore !== null" type="button" class="button secondary block" style="margin-top: 12px" :disabled="!!state.request" @click="load(true)">Load more</button>
  </template>
</template>
