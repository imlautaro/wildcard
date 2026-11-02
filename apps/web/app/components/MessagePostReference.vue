<script setup lang="ts">
import type { HomePostReference } from '~/utils/types';

// The For you post a private message answers (docs/updates.md#continue-in-chat), shown in the
// composer and above the message. It is a link to the post itself, not a quote of its text:
// clicking opens the post while it is still in For you.
const props = defineProps<{ post: HomePostReference; interactive?: boolean }>();
const active = computed(() => props.interactive && props.post.available);
const accents = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'pink', 'indigo', 'gray'];
const accent = computed(() => accents.includes(props.post.accent ?? '') ? props.post.accent : 'blue');
function open() {
  if (active.value) void navigateTo({ path: '/updates', query: { post: props.post.id } });
}
</script>

<template>
  <button
    type="button" class="post-reference" :class="[`accent-${accent}`, { active }]" :disabled="!active"
    :aria-label="$t(post.available ? 'updates.reference.aria' : 'updates.reference.ariaGone', { title: post.title })" @click.stop="open"
  >
    <span class="label"><AppIcon name="sparkle" />{{ $t('updates.reference.label') }}</span>
    <span class="title">{{ post.title || $t('updates.reference.post') }}</span>
    <span v-if="post.text" class="text">{{ post.text }}</span>
    <span v-if="!post.available" class="gone">{{ $t('updates.reference.gone') }}</span>
  </button>
</template>

<style scoped>
.post-reference {
  --post-accent: #1a73e8;
  display: flex; flex-direction: column; gap: 1px; width: 100%; min-width: 0; margin: 0; padding: 6px 10px 6px 11px;
  border: 0; border-radius: 10px; background: color-mix(in srgb, var(--md-on-surface) 7%, transparent); color: inherit; font: inherit; text-align: left;
  white-space: normal; position: relative; overflow: hidden; cursor: default;
}
.post-reference::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--post-accent); }
.post-reference.active { cursor: pointer; }
.post-reference.active:hover { background: color-mix(in srgb, var(--md-on-surface) 11%, transparent); }
.post-reference:disabled { opacity: 1; }
.label { display: flex; align-items: center; gap: var(--space-1); font-size: 12px; font-weight: 700; color: var(--post-accent); }
.label svg { width: 13px; height: 13px; }
.title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text {
  font-size: 13px; color: var(--md-on-surface-variant); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}
.gone { font: var(--type-label-small); font-style: italic; color: var(--md-on-surface-variant); }
.accent-blue { --post-accent: #1a73e8; } .accent-green { --post-accent: #188038; } .accent-orange { --post-accent: #e8710a; }
.accent-red { --post-accent: #d93025; } .accent-purple { --post-accent: #9334e6; } .accent-teal { --post-accent: #12838f; }
.accent-pink { --post-accent: #d01884; } .accent-indigo { --post-accent: #3f51b5; } .accent-gray { --post-accent: #636363; }
:root[data-theme="dark"] .accent-blue { --post-accent: #8ab4f8; } :root[data-theme="dark"] .accent-green { --post-accent: #81c995; }
:root[data-theme="dark"] .accent-orange { --post-accent: #fcad70; } :root[data-theme="dark"] .accent-red { --post-accent: #f28b82; }
:root[data-theme="dark"] .accent-purple { --post-accent: #c58af9; } :root[data-theme="dark"] .accent-teal { --post-accent: #78d9ec; }
:root[data-theme="dark"] .accent-pink { --post-accent: #ff8bcb; } :root[data-theme="dark"] .accent-indigo { --post-accent: #9fa8da; }
:root[data-theme="dark"] .accent-gray { --post-accent: #c0c0c0; }
</style>
