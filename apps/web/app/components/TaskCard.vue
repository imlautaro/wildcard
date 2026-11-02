<script setup lang="ts">
import type { TaskItem, TaskList } from '~/utils/types';

// One task on the board (TaskBoard.vue). Rendering only: the board owns the editor,
// the mutations and the move animation, which finds cards by `data-task-id` and
// reads `data-status`, `data-ready` and `data-review` to pick a highlight.
// `compact` (the chat side panel) keeps status lines and drops the longer details.
const props = defineProps<{ task: TaskItem; list: TaskList; compact?: boolean; busy?: boolean }>();
const emit = defineEmits<{ toggle: []; edit: [] }>();
const { t } = useI18n();

const unfinished = (task: TaskItem) => task.status === 'open' || task.status === 'in_progress';
const isAgent = computed(() => props.task.assigneeKind === 'agent');
const workLabel = computed(() => {
  const task = props.task;
  if (!isAgent.value || !unfinished(task)) return null;
  if (task.workState === 'paused') return t('miniapps.tasks.work.paused');
  if (task.workState === 'blocked') return t('miniapps.tasks.work.blocked');
  return task.workUsed >= task.workLimit ? t('miniapps.tasks.work.exhausted') : null;
});
const working = computed(() => isAgent.value && props.task.status === 'in_progress' && !workLabel.value);
const waitingFor = computed(() => props.task.blocked
  ? props.task.blockedBy.map(id => props.list.tasks.find(item => item.id === id)).filter((item): item is TaskItem => !!item && unfinished(item)).map(item => item.title)
  : []);
const ready = computed(() => props.task.status === 'open' && props.task.blockedBy.length > 0 && !props.task.blocked);
const returned = computed(() => props.task.reviewRounds > 0 && !!props.task.reviewFeedback && unfinished(props.task));
const locked = computed(() => props.list.status === 'canceled' || props.task.status === 'canceled');
const icon = computed<AppIconName>(() => props.task.status === 'done' ? 'check' : props.task.status === 'canceled' ? 'block' : props.task.blocked ? 'clock' : 'circle');
</script>

<template>
  <article
    class="task-card" :class="[`status-${task.status}`, { compact }]"
    :data-task-id="task.id" :data-status="task.status" :data-ready="ready ? '1' : '0'" :data-review="task.reviewRounds"
  >
    <div class="task-card-head">
      <!-- Raw markup: AppIconButton only fills its glyph through `selected`, which would add aria-pressed. -->
      <button
        type="button" class="icon-button task-card-check" :disabled="busy || locked"
        :aria-label="task.status === 'done' ? t('miniapps.tasks.markNotDone', { title: task.title }) : t('miniapps.tasks.markDone', { title: task.title })"
        @click="emit('toggle')"
      >
        <AppIcon :name="icon" :filled="task.status === 'done'" />
      </button>
      <button type="button" class="task-card-title link-button" :disabled="list.status === 'canceled'" @click="emit('edit')">{{ task.title }}</button>
    </div>

    <p v-if="returned" class="task-card-note warning">
      <AppIcon name="reply" />{{ t('miniapps.tasks.revisionRoundFeedback', { round: task.reviewRounds, limit: task.reviewRoundLimit ?? 2, feedback: task.reviewFeedback }) }}
    </p>
    <p v-if="waitingFor.length" class="task-card-note"><AppIcon name="clock" />{{ t('miniapps.tasks.waitingFor', { tasks: nameList(waitingFor) }) }}</p>
    <p v-if="ready" class="task-card-note primary"><AppIcon name="done" />{{ t('miniapps.tasks.board.ready') }}</p>
    <p v-if="task.blockedReason && unfinished(task)" class="task-card-note warning">{{ t('miniapps.tasks.blocked', { text: task.blockedReason }) }}</p>
    <template v-if="!compact">
      <p v-if="task.nextStep && unfinished(task)" class="task-card-line">{{ t('miniapps.tasks.nextStep', { text: task.nextStep }) }}</p>
      <p v-if="task.result" class="task-card-result">{{ task.result }}</p>
      <p v-if="task.documentID" class="task-card-line">{{ t('miniapps.tasks.deliverable', { title: task.documentTitle ?? t('miniapps.tasks.aDocument') }) }}</p>
    </template>

    <div class="task-card-meta">
      <AppAvatar v-if="task.assigneeName" :name="task.assigneeName" :size="20" />
      <span class="task-card-assignee">{{ task.assigneeName ?? t('miniapps.tasks.unassigned') }}</span>
      <AppChip v-if="working" tone="primary" class="task-working"><span class="live-dot" aria-hidden="true" />{{ t('miniapps.tasks.working') }}</AppChip>
      <AppChip v-else-if="workLabel">{{ workLabel }}</AppChip>
      <AppChip v-if="!compact && task.reviewRounds > 0 && !returned">{{ t('miniapps.tasks.revisionRound', { round: task.reviewRounds, limit: task.reviewRoundLimit ?? 2 }) }}</AppChip>
      <span v-if="!compact && isAgent && unfinished(task)" class="task-card-turns">{{ t('miniapps.tasks.work.turns', { used: task.workUsed, limit: task.workLimit }) }}</span>
    </div>
    <div v-if="working" class="task-card-progress" aria-hidden="true"><i /></div>
  </article>
</template>

<style scoped>
.task-card {
  position: relative; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) var(--space-3) var(--space-3) var(--space-1);
  border-radius: var(--md-shape-m); background: var(--md-surface-container-lowest); box-shadow: var(--md-elevation-1);
}
.task-card.compact { gap: var(--space-1-5); padding-bottom: var(--space-2); }
.task-card-head { display: flex; align-items: flex-start; gap: var(--space-0-5); }
.task-card-check { flex: none; }
.task-card-check :deep(svg) { color: var(--md-primary); }
.status-done .task-card-check :deep(svg) { color: var(--md-success); }
.task-card-title {
  display: block; flex: 1; min-width: 0; min-height: 40px; padding: 10px 0 0; border-radius: var(--md-shape-xs);
  text-align: left; white-space: normal; color: inherit; font: var(--type-title-small); letter-spacing: normal; overflow-wrap: anywhere;
}
.compact .task-card-title { font-size: 13px; line-height: 18px; }
.status-done .task-card-title, .status-canceled .task-card-title { color: var(--md-on-surface-variant); }
.status-canceled .task-card-title { text-decoration: line-through; }
/* Lines under the title align with it, past the 40px check button. */
.task-card > p, .task-card-meta, .task-card-progress { margin: 0 0 0 42px; }
.task-card-note {
  display: flex; align-items: flex-start; gap: var(--space-1-5); padding: var(--space-1-5) var(--space-2); border-radius: var(--md-shape-s);
  background: var(--md-surface-container-low); color: var(--md-on-surface-variant); font: var(--type-body-small); font-weight: 600; overflow-wrap: anywhere;
}
.task-card-note :deep(svg) { width: 14px; height: 14px; flex: none; margin-top: 1px; }
.task-card-note.warning { background: var(--md-warning-container); color: var(--md-on-warning-container); }
.task-card-note.primary { background: var(--md-primary-container); color: var(--md-on-primary-container); }
.task-card-line { font: var(--type-body-small); color: var(--md-on-surface-variant); overflow-wrap: anywhere; }
.task-card-result {
  padding: var(--space-2); border-radius: var(--md-shape-s); background: var(--md-success-container); color: var(--md-on-success-container);
  font: var(--type-body-small); white-space: pre-wrap; overflow-wrap: anywhere;
}
.task-card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1-5); font: var(--type-body-small); color: var(--md-on-surface-variant); }
.task-card-assignee { min-width: 0; overflow-wrap: anywhere; }
.task-card-meta .task-working { margin-left: 0; }
.task-card-turns { font: var(--type-label-small); }
.task-card-progress { position: relative; height: 3px; overflow: hidden; border-radius: 2px; background: var(--md-primary-container); }
.task-card-progress i {
  position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 2px; background: var(--md-primary);
  animation: task-card-slide 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes task-card-slide { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
/* Highlights added by TaskBoard.vue when a card lands in a new state. */
.task-card.glow-success { animation: task-card-glow-success 1.6s ease-out; }
.task-card.glow-warning { animation: task-card-glow-warning 1.6s ease-out; }
.task-card.glow-primary { animation: task-card-glow-primary 1.6s ease-out; }
@keyframes task-card-glow-success { 0%, 30% { box-shadow: 0 0 0 2px var(--md-success), var(--md-elevation-2); } }
@keyframes task-card-glow-warning { 0%, 30% { box-shadow: 0 0 0 2px var(--md-warning), var(--md-elevation-2); } }
@keyframes task-card-glow-primary { 0%, 30% { box-shadow: 0 0 0 2px var(--md-primary), var(--md-elevation-2); } }
@media (prefers-reduced-motion: reduce) {
  .task-card-progress i, .task-card.glow-success, .task-card.glow-warning, .task-card.glow-primary { animation: none; }
}
</style>
