<script setup lang="ts">
import type { ReplyPreview } from '~/utils/replies';

// A quoted message inside a bubble or the composer. Clicking shows the original.
const props = defineProps<{ preview: ReplyPreview; interactive?: boolean }>();
const emit = defineEmits<{ open: [] }>();
const summary = computed(() => quoteSummary(props.preview.quote));
const active = computed(() => props.interactive && props.preview.quote.available);
</script>

<template>
  <button
    type="button" class="reply-quote" :class="{ active }" :disabled="!active"
    :style="{ '--quote-light': preview.color.light, '--quote-dark': preview.color.dark }"
    :aria-label="`Reply to ${preview.author}: ${summary}`" @click.stop="emit('open')"
  >
    <span class="author">{{ preview.author }}</span>
    <span class="text" :class="{ unavailable: !preview.quote.available }">
      <AppIcon v-if="preview.quote.available && preview.quote.attachment" :name="preview.quote.attachment.mimeType.startsWith('image/') ? 'image' : 'file'" />{{ summary }}
    </span>
  </button>
</template>

<style scoped>
.reply-quote {
  display: flex; flex-direction: column; gap: 1px; width: 100%; min-width: 0; margin: 0; padding: 5px 10px 5px 11px;
  border: 0; border-radius: 10px; background: color-mix(in srgb, var(--md-on-surface) 7%, transparent); color: inherit; font: inherit; text-align: left;
  white-space: normal; position: relative; overflow: hidden; cursor: default;
}
.reply-quote::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--quote-light); }
.reply-quote.active { cursor: pointer; }
.reply-quote.active:hover { background: color-mix(in srgb, var(--md-on-surface) 11%, transparent); }
.reply-quote:disabled { opacity: 1; }
.author { font-size: 13px; font-weight: 700; color: var(--quote-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text {
  font-size: 13px; color: var(--md-on-surface-variant); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.text svg { width: 14px; height: 14px; vertical-align: -2px; margin-right: var(--space-1); }
.text.unavailable { font-style: italic; }
@media (prefers-color-scheme: dark) {
  .reply-quote::before { background: var(--quote-dark); }
  .author { color: var(--quote-dark); }
}
</style>
