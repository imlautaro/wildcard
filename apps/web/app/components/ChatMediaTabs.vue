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
const tabs: { value: ChatMediaKind; label: string }[] = [{ value: 'image', label: 'Media' }, { value: 'file', label: 'Docs' }];
const { state, load } = useChatMedia(() => props.base, tab);
watch([() => props.base, tab], () => { load(); if (tab.value === 'file') documents.refresh(); }, { immediate: true });
</script>

<template>
  <div class="group-title">Shared in this chat</div>
  <AppSegmented v-model="tab" :options="tabs" label="Shared in this chat" />
  <template v-if="tab === 'file'">
    <AppListGroup>
      <AppListItem v-for="doc in documents.state.value.items" :key="doc.id" :to="`${documentRoute}/${doc.id}`"
        :supporting="`${doc.updatedByName} · ${dayLabel(doc.updatedAt)}`">
        <template #leading><span class="mini-app-glyph"><AppIcon name="file" /></span></template>
        {{ doc.title }}
      </AppListItem>
      <AppListItem icon="plus" :disabled="creating" @click="newDocument">New document</AppListItem>
    </AppListGroup>
    <div class="group-title">Files</div>
  </template>
  <AppLoading v-if="!state.loaded && state.request" />
  <AppListGroup v-else-if="!state.loaded && state.error">
    <div class="text-block">{{ state.error }}</div>
    <AppListItem icon="refresh" @click="load(false, true)">Try again</AppListItem>
  </AppListGroup>
  <template v-else-if="state.loaded">
    <AppListGroup v-if="!state.items.length"><div class="text-block">{{ tab === 'image' ? 'No photos in this chat yet.' : 'No files in this chat yet.' }}</div></AppListGroup>
    <div v-else-if="tab === 'image'" class="media-grid">
      <ChatMediaThumb v-for="item in state.items" :key="chatMediaItemKey(item)" :name="item.name" :path="attachmentPath(item)" />
    </div>
    <AppListGroup v-else>
      <div v-for="item in state.items" :key="chatMediaItemKey(item)" class="field media-file">
        <MessageAttachment :attachment="item" :path="attachmentPath(item)" />
        <span class="small muted">{{ item.senderName ? `${item.senderName} · ` : '' }}{{ dayLabel(item.createdAt) }}</span>
      </div>
    </AppListGroup>
    <AppButton v-if="state.nextBefore !== null" variant="tonal" block class="load-more" :disabled="!!state.request" @click="load(true)">Load more</AppButton>
  </template>
</template>

<style scoped>
.load-more { margin-top: var(--space-3); }
</style>
