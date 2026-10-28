<script setup lang="ts">
import { renderMessageMarkdown } from '~/utils/messageMarkdown';

const props = defineProps<{ text: string }>();
const html = computed(() => renderMessageMarkdown(props.text));
</script>

<template>
  <div class="message-markdown" v-html="html" />
</template>

<style scoped>
.message-markdown { white-space: normal; min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }
.message-markdown :deep(> :first-child) { margin-top: 0; }
.message-markdown :deep(> :last-child) { margin-bottom: 0; }
.message-markdown :deep(strong) { font-weight: 700; }
.message-markdown :deep(em) { font-style: italic; font-synthesis: style; }
.message-markdown :deep(p) { margin: 0 0 0.6em; }
.message-markdown :deep(h1), .message-markdown :deep(h2), .message-markdown :deep(h3),
.message-markdown :deep(h4), .message-markdown :deep(h5), .message-markdown :deep(h6) {
  font-size: 1.05em; line-height: 1.3; margin: 0.8em 0 0.35em; font-weight: 700;
}
.message-markdown :deep(h1) { font-size: 1.2em; }
.message-markdown :deep(ul), .message-markdown :deep(ol) { padding-left: 1.5em; margin: 0.4em 0; }
.message-markdown :deep(li + li) { margin-top: 0.2em; }
.message-markdown :deep(li > p) { margin-bottom: 0.3em; }
.message-markdown :deep(blockquote) { margin: 0.5em 0; padding-left: 0.75em; border-left: 3px solid var(--secondary); }
.message-markdown :deep(code) { font-family: ui-monospace, monospace; font-size: 0.9em; background: var(--hover); padding: 0.1em 0.25em; border-radius: 4px; }
.message-markdown :deep(pre) { margin: 0.5em 0; padding: 10px; background: var(--hover); border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.message-markdown :deep(pre code) { padding: 0; background: transparent; }
.message-markdown :deep(a) { color: var(--accent); text-decoration: underline; }
.message-markdown :deep(hr) { border: 0; border-top: 1px solid var(--separator); margin: 0.75em 0; }
.message-markdown :deep(table) { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 0.5em 0; }
.message-markdown :deep(th), .message-markdown :deep(td) { padding: 4px 8px; border: 1px solid var(--separator); }
</style>
