<script setup lang="ts">
// A group: one request, contacts split the work into tasks (one of them added by
// another person in the group), the board moves, and a shared document lands.
type Column = 'todo' | 'doing' | 'done';
interface Task { id: string; title: string; who: CastId; waits?: string }
const { t } = useI18n();
const tasks = computed<Task[]>(() => [
  { id: 'flights', title: t('groupScene.flights'), who: 'mila' },
  { id: 'stay', title: t('groupScene.stay'), who: 'theo' },
  { id: 'food', title: t('groupScene.food'), who: 'coco' },
  { id: 'plan', title: t('groupScene.plan'), who: 'mila', waits: t('groupScene.waits') },
]);
// Column of each task at each beat (index = step).
const columns: Record<string, Column[]> = {
  flights: ['todo', 'todo', 'doing', 'doing', 'doing', 'doing', 'done', 'done', 'done', 'done'],
  stay: ['todo', 'todo', 'todo', 'doing', 'doing', 'doing', 'doing', 'done', 'done', 'done'],
  food: ['todo', 'todo', 'todo', 'todo', 'todo', 'doing', 'doing', 'done', 'done', 'done'],
  plan: ['todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo', 'doing', 'done'],
};
const root = ref<HTMLElement | null>(null);
// 1 ask · 2 Mila · 3 Theo · 4 Ana adds Coco · 5 Coco · 6–8 progress · 9 plan · (final) doc
const { step, fading, composer } = useChatScene(root, [700, 1300, 1300, 1300, 1400, 1300, 1300, 1300, 1600], [
  { step: 1, text: () => t('groupScene.ask') },
], { hold: 4600 });
const lanes = computed<{ id: Column; label: string }[]>(() => [
  { id: 'todo', label: t('groupScene.todo') }, { id: 'doing', label: t('groupScene.doing') }, { id: 'done', label: t('groupScene.done') },
]);
const inLane = (lane: Column) => tasks.value.filter((task) => columns[task.id]![Math.min(step.value, 9)] === lane);
</script>

<template>
  <div ref="root" class="group-scene scene stage" :class="{ fading }">
    <PhoneFrame v-bind="composer()" :title="t('groupScene.title')" :group="['mila', 'theo', 'coco']" :status="t('groupScene.members')" class="group-phone">
      <div class="thread">
        <div v-if="step >= 1" class="bubble-row outgoing pop"><div class="bubble">{{ t('groupScene.ask') }}</div></div>
        <div v-if="step >= 2" class="bubble-row incoming pop">
          <ContactAvatar who="mila" :size="28" />
          <div class="bubble" :style="{ '--sender-light': cast.mila.tint[0], '--sender-dark': cast.mila.tint[1] }"><span class="sender">Mila</span>{{ t('groupScene.mila') }}</div>
        </div>
        <div v-if="step >= 3" class="bubble-row incoming pop">
          <ContactAvatar who="theo" :size="28" />
          <div class="bubble" :style="{ '--sender-light': cast.theo.tint[0], '--sender-dark': cast.theo.tint[1] }"><span class="sender">Theo</span>{{ t('groupScene.theo') }}</div>
        </div>
        <div v-if="step >= 4" class="system-banner pop"><SiteIcon name="users" />{{ t('groupScene.added') }}</div>
        <div v-if="step >= 5" class="bubble-row incoming pop">
          <ContactAvatar who="coco" :size="28" />
          <div class="bubble" :style="{ '--sender-light': cast.coco.tint[0], '--sender-dark': cast.coco.tint[1] }"><span class="sender">Coco</span>{{ t('groupScene.coco') }}</div>
        </div>
      </div>
    </PhoneFrame>

    <div class="board">
      <div class="board-head"><SiteIcon name="checklist" /><strong>{{ t('groupScene.tasks') }}</strong><small>{{ t('groupScene.progress', { done: inLane('done').length, total: tasks.length }) }}</small></div>
      <div class="board-lanes">
        <div v-for="lane in lanes" :key="lane.id" class="board-lane">
          <span class="lane-label">{{ lane.label }}</span>
          <TransitionGroup tag="div" name="card" class="lane-cards">
            <div v-for="task in inLane(lane.id)" :key="task.id" class="task" :class="lane.id">
              <span class="task-title">
                <SiteIcon v-if="lane.id === 'done'" name="check" class="task-check" />{{ task.title }}
              </span>
              <span class="task-meta">
                <ContactAvatar :who="task.who" :size="20" />{{ cast[task.who].name }}
                <span v-if="task.waits && lane.id === 'todo'" class="waits">· {{ task.waits }}</span>
              </span>
              <span v-if="lane.id === 'doing'" class="progress"><i /></span>
            </div>
          </TransitionGroup>
        </div>
      </div>
      <Transition name="doc">
        <div v-if="step >= 9" class="doc">
          <span class="doc-icon"><SiteIcon name="doc" /></span>
          <span class="doc-text"><strong>{{ t('groupScene.doc') }}</strong><small>{{ t('groupScene.docMeta') }}</small></span>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.group-scene { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: clamp(16px, 3vw, 32px); padding: clamp(16px, 3vw, 32px); align-items: center; }
.board { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.board-head { display: flex; align-items: center; gap: var(--space-2); font: var(--type-title-medium); }
.board-head svg { width: 22px; height: 22px; color: var(--md-primary); }
.board-head small { margin-left: auto; font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.board-lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.board-lane { display: flex; flex-direction: column; gap: var(--space-2); min-height: 300px; padding: var(--space-2); border-radius: var(--md-shape-l); background: var(--md-surface-container); }
.lane-label { padding: var(--space-1) var(--space-2); font: var(--type-label-medium); color: var(--md-on-surface-variant); }
.lane-cards { position: relative; display: flex; flex-direction: column; gap: var(--space-2); }
.task { display: flex; flex-direction: column; gap: var(--space-1-5); padding: var(--space-3); border-radius: var(--md-shape-m); background: var(--md-surface); box-shadow: var(--md-elevation-1); }
.task-title { display: flex; align-items: flex-start; gap: var(--space-1); font: var(--type-title-small); font-size: 13px; line-height: 17px; }
.task.done .task-title { color: var(--md-on-surface-variant); }
.task-check { width: 16px; height: 16px; flex: none; color: var(--md-success); }
.task-meta { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); font: var(--type-label-small); color: var(--md-on-surface-variant); }
.waits { color: var(--md-warning); }
.progress { height: 4px; border-radius: 2px; background: var(--md-secondary-container); overflow: hidden; }
.progress i { display: block; height: 100%; width: 40%; border-radius: inherit; background: var(--md-primary); animation: work 1.6s var(--md-ease) infinite; }
@keyframes work { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
.card-move { transition: transform 600ms var(--md-ease); }
.card-enter-active { transition: opacity 400ms 150ms, transform 500ms var(--ui-ease-spring) 150ms; }
.card-enter-from { opacity: 0; transform: scale(0.92); }
.card-leave-active { position: absolute; left: 0; right: 0; transition: opacity 200ms; }
.card-leave-to { opacity: 0; }

.doc { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--md-shape-l); background: var(--md-primary-container); color: var(--md-on-primary-container); }
.doc-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--md-shape-m); background: var(--md-primary); color: var(--md-on-primary); }
.doc-icon svg { width: 22px; height: 22px; }
.doc-text { display: flex; flex-direction: column; min-width: 0; }
.doc-text strong { font: var(--type-title-small); }
.doc-text small { font: var(--type-body-small); opacity: 0.8; }
.doc-enter-active { transition: transform 600ms var(--ui-ease-spring), opacity 300ms; }
.doc-enter-from { transform: translateY(16px) scale(0.96); opacity: 0; }

@media (max-width: 900px) {
  .group-scene { grid-template-columns: minmax(0, 1fr); }
  .group-phone { order: 0; }
  .board-lane { min-height: 0; }
}
@media (max-width: 520px) {
  .board-lanes { grid-template-columns: minmax(0, 1fr); }
}
</style>
