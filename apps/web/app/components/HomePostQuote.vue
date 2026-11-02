<script setup lang="ts">
import type { HomePostQuote } from '~/utils/types';

// Another contact's post that a For you post quotes, like a quote post on X
// (docs/updates.md#quote-posts). Clicking opens the quoted post with its comments.
const props = defineProps<{ quote: HomePostQuote }>();
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
const name = computed(() => props.quote.contactName ?? t('updates.aContact'));
const avatar = computed(() => props.quote.contactID ? contactPhotoPath({ id: props.quote.contactID, photoVersion: props.quote.contactPhotoVersion }) : null);
</script>

<template>
  <button type="button" class="post-quote" :aria-label="$t('updates.post.quoteAria', { name })" @click.stop="emit('open')">
    <span class="quote-head">
      <AppAvatar :name="name" :path="avatar" :size="20" />
      <strong class="who">{{ name }}</strong>
      <span v-if="quote.title" class="topic">{{ quote.title }}</span>
      <span v-if="quote.createdAt" class="when">· {{ compactAge(quote.createdAt) }}</span>
    </span>
    <span class="quote-text">{{ quote.text || quote.title }}</span>
  </button>
</template>

<style scoped>
.post-quote { display: flex; flex-direction: column; gap: var(--space-1); width: 100%; min-width: 0; margin: 0; padding: var(--space-3);
  border: 1px solid var(--md-outline-variant); border-radius: var(--md-shape-l); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.post-quote:hover { background: var(--md-surface-container-low); }
.quote-head { display: flex; align-items: center; gap: var(--space-1-5); min-width: 0; font-size: 13px; }
.quote-head .who { flex: none; }
.quote-head .topic, .quote-head .when { color: var(--md-on-surface-variant); }
.quote-head .topic { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quote-head .when { flex: none; }
.quote-text { font-size: 14px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
</style>
