<script setup lang="ts">
// What a post becomes after "Less like this" (docs/updates.md#less-like-this): the feedback
// is saved for its topic, the post stays in place as this notice, Undo brings it back and
// X removes that one post from For you.
defineProps<{ busy?: boolean }>();
defineEmits<{ undo: []; dismiss: [] }>();
</script>

<template>
  <div class="home-post less-notice" role="status">
    <AppIcon name="thumb-down" class="less-icon" />
    <p class="less-text">{{ $t('updates.post.lessNotice') }}</p>
    <button class="link-button" :disabled="busy" @click="$emit('undo')">{{ $t('updates.post.lessNoticeUndo') }}</button>
    <AppIconButton icon="close" size="small" :tooltip="false" :disabled="busy" :label="$t('updates.post.lessNoticeDismiss')" @click="$emit('dismiss')" />
  </div>
</template>

<style scoped>
/* `.home-post` lets the timeline give it the same frame as the post it replaces. */
.less-notice { display: flex; align-items: center; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); }
.less-icon { flex: none; color: var(--md-on-surface-variant); }
.less-text { flex: 1; min-width: 0; margin: 0; font: var(--type-body-medium); color: var(--md-on-surface-variant); }
.link-button { flex: none; }
</style>
