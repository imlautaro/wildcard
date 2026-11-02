<script setup lang="ts">
// The task board beside a chat's messages (useTaskPanel.ts). `base` is `contacts/:id`
// or `groups/:id`; `to` is the full Tasks page.
defineProps<{ base: string; to: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <aside class="task-panel" :aria-label="$t('miniapps.tasks.title')">
    <header class="task-panel-head">
      <AppIcon name="tasks" />
      <h2>{{ $t('miniapps.tasks.title') }}</h2>
      <AppIconButton :to="to" icon="open-in-new" :label="$t('miniapps.tasks.board.openBoard')" />
      <AppIconButton icon="close" :label="$t('miniapps.tasks.board.hidePanel')" @click="emit('close')" />
    </header>
    <TaskBoard :base="base" variant="panel" />
  </aside>
</template>

<style scoped>
.task-panel {
  flex: none; width: 340px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 var(--space-3) var(--space-6);
  border-left: 1px solid var(--md-outline-variant); background: var(--md-surface-container-low);
}
@media (min-width: 1600px) { .task-panel { width: 380px; } }
.task-panel-head {
  position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: var(--space-1); margin: 0 calc(-1 * var(--space-3)) var(--space-1);
  padding: var(--space-2) var(--space-1) var(--space-2) var(--space-4); background: var(--md-surface-container-low);
}
.task-panel-head h2 { flex: 1; margin: 0; font: var(--type-title-medium); }
.task-panel-head > svg { width: 20px; height: 20px; color: var(--md-on-surface-variant); }
</style>
