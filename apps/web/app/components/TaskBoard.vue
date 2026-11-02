<script setup lang="ts">
import type { TaskItem, TaskList, TaskStatus } from '~/utils/types';

// Shared to-do lists of one chat as a board (docs/tasks.md). `base` is `contacts/:id` or
// `groups/:id`. One list shows at a time, in To do / In progress / Done columns that stack
// into sections (In progress first) when the board is narrow. `panel` is the group chat's
// side panel: compact cards, no list creation or quick add.
const props = withDefaults(defineProps<{ base: string; variant?: 'page' | 'panel' }>(), { variant: 'page' });
const tasks = useTasks(() => props.base);
const board = computed(() => tasks.state.value.value);
const error = ref<string | null>(null);
const busy = ref(false);
const newList = ref('');
const drafts = reactive<Record<string, string>>({});
const editing = ref<string | null>(null);
// Polls replace the board while the form stays open. Submit the version and
// permission snapshot the person actually edited, even if newer data arrived.
const editingTask = shallowRef<TaskItem | null>(null);
const form = reactive({ title: '', notes: '', status: 'open' as TaskStatus, assignee: '', blockedBy: [] as string[], nextStep: '', evidence: '', blockedReason: '', researchQuery: '', monitorURL: '', monitorKeywords: '', monitorInterval: 360 });

const { t } = useI18n();
// Known server values map to message keys; an unknown value shows as sent.
const researchStatuses = ['pending', 'ready', 'stopped', 'complete', 'failed'];
const researchDetail = (task: TaskItem) => {
  const counts = { used: task.researchUsed ?? 0, limit: task.researchLimit ?? 1 };
  if (!task.researchStatus) return t('miniapps.tasks.research.detail', counts);
  const status = researchStatuses.includes(task.researchStatus) ? t(`miniapps.tasks.research.statuses.${task.researchStatus}`) : task.researchStatus;
  return t('miniapps.tasks.research.detailStatus', { ...counts, status });
};
const monitorIntervalKeys: Record<number, string> = { 60: 'hourly', 360: 'sixHours', 1440: 'daily' };
const monitorIntervals = computed(() => [60, 360, 1440].map(value => ({ value, label: t(`miniapps.tasks.monitor.intervals.${monitorIntervalKeys[value]}`) })));
const monitorOutcomes = ['baseline', 'unchanged', 'repeated', 'ignored', 'changed', 'failed'];
const checkLabel = (check: TaskItem['monitorChecks'][number]) => `${monitorOutcomes.includes(check.outcome) ? t(`miniapps.tasks.monitor.outcomes.${check.outcome}`) : check.outcome}${check.errorCode ? ` (${check.errorCode}${check.httpStatus ? ` ${check.httpStatus}` : ''})` : ''} · ${new Date(check.checkedAt).toLocaleString(appLocale(), { dateStyle: 'short', timeStyle: 'short' })}`;
const monitorDetail = (task: TaskItem) => {
  const last = task.monitorChecks?.[0];
  const interval = task.monitorInterval != null && monitorIntervalKeys[task.monitorInterval] ? t(`miniapps.tasks.monitor.intervalsInline.${monitorIntervalKeys[task.monitorInterval]}`) : '';
  return [task.monitorURL ? t('miniapps.tasks.monitor.active', { interval }) : t('miniapps.tasks.monitor.removed'),
    t('miniapps.tasks.monitor.turns', { used: task.monitorTurnsUsed ?? 0, limit: task.monitorTurnLimit ?? 20 }), task.monitorPending ? t('miniapps.tasks.monitor.pending') : '',
    last ? t('miniapps.tasks.monitor.last', { check: checkLabel(last) }) : task.monitorURL ? t('miniapps.tasks.monitor.notChecked') : ''].filter(Boolean).join(' · ');
};
const originalTask = (task: TaskItem) => editingTask.value?.id === task.id ? editingTask.value : task;
const assignmentChanged = (task: TaskItem) => {
  const original = originalTask(task);
  return form.assignee !== (original.assigneeKind ? `${original.assigneeKind}:${original.assigneeID}` : '');
};
const statuses: TaskStatus[] = ['open', 'in_progress', 'done', 'canceled'];
const statusLabel = (status: TaskStatus) => t(`miniapps.tasks.status.${status}`);
const statusOptions = computed(() => statuses.map(value => ({ value, label: statusLabel(value) })));
const assigneeOptions = computed(() => [{ value: '', label: t('miniapps.tasks.unassigned') },
  ...(board.value?.members ?? []).map(member => ({ value: `${member.kind}:${member.id}`, label: member.kind === 'user' && member.id === useSession().user.value?.id ? t('miniapps.tasks.memberYou', { name: member.name }) : member.name }))]);

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tasks.refresh(true);
  timer = setInterval(() => { if (document.visibilityState === 'visible') tasks.refresh(); }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));

async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try { await action(); }
  catch (failure) { error.value = errorMessage(failure); tasks.refresh(true); }
  finally { busy.value = false; }
}
const assignee = (value: string) => value ? { kind: value.split(':')[0], id: value.slice(value.indexOf(':') + 1) } : null;
const controlWork = (task: TaskItem, workState: 'active' | 'paused') => run(async () => {
  await tasks.updateTask(task.id, originalTask(task).version, { workState });
  editing.value = null;
});
function edit(task: TaskItem) {
  if (editing.value === task.id) { editing.value = null; return; }
  editing.value = task.id;
  editingTask.value = task;
  Object.assign(form, { title: task.title, notes: task.notes ?? '', status: task.status, nextStep: task.nextStep ?? '', evidence: task.evidence ?? '', blockedReason: task.blockedReason ?? '', researchQuery: task.researchQuery ?? '',
    monitorURL: task.monitorURL ?? '', monitorKeywords: task.monitorKeywords ?? '', monitorInterval: task.monitorInterval ?? 360,
    assignee: task.assigneeKind ? `${task.assigneeKind}:${task.assigneeID}` : '', blockedBy: [...task.blockedBy] });
}
const toggle = (task: TaskItem) => run(() => tasks.updateTask(task.id, task.version, { status: task.status === 'done' ? 'open' : 'done' }));
const save = (task: TaskItem) => run(async () => {
  const original = originalTask(task);
  await tasks.updateTask(task.id, original.version, { title: form.title.trim(), notes: form.notes.trim() || null, status: form.status,
    assignee: assignee(form.assignee), blockedBy: form.blockedBy, nextStep: form.nextStep.trim() || null,
    evidence: form.evidence.trim() || null, blockedReason: form.blockedReason.trim() || null,
    ...(!assignmentChanged(task) && form.researchQuery.trim() !== (original.researchQuery ?? '') ? { researchQuery: form.researchQuery.trim() || null } : {}),
    ...(!assignmentChanged(task) && form.monitorURL.trim() !== (original.monitorURL ?? '') ? { monitorURL: form.monitorURL.trim() || null } : {}),
    ...(!assignmentChanged(task) && form.monitorKeywords.trim() !== (original.monitorKeywords ?? '') ? { monitorKeywords: form.monitorKeywords.trim() || null } : {}),
    ...(!assignmentChanged(task) && form.monitorInterval !== (original.monitorInterval ?? 360) ? { monitorInterval: form.monitorInterval } : {}) });
  editing.value = null;
});
const createList = () => run(async () => {
  if (!newList.value.trim()) return;
  await tasks.createList(newList.value.trim(), []);
  newList.value = '';
});
const addTask = (list: TaskList) => run(async () => {
  const title = drafts[list.id]?.trim();
  if (!title) return;
  await tasks.addTask(list.id, { title });
  drafts[list.id] = '';
});
const cancelList = (list: TaskList) => run(async () => {
  if (!window.confirm(t('miniapps.tasks.cancelListConfirm', { title: list.title }))) return;
  await tasks.cancelList(list.id);
});

// The list on screen: the person's pick, else the first active list, else the first one.
const selectedListID = ref<string | null>(null);
const lists = computed(() => board.value?.lists ?? []);
const current = computed(() => lists.value.find(list => list.id === selectedListID.value)
  ?? lists.value.find(list => list.status === 'active') ?? lists.value[0] ?? null);
const showCanceled = ref(false);
// The panel lists In progress first in the DOM too, so reading order matches what is shown;
// the page's narrow layout reorders its columns with CSS only.
const laneStatuses = computed(() => props.variant === 'panel' ? ['in_progress', 'open', 'done'] as const : ['open', 'in_progress', 'done'] as const);
const lanes = computed(() => laneStatuses.value.map(status => ({ status, tasks: current.value?.tasks.filter(task => task.status === status) ?? [] })));
const canceledTasks = computed(() => current.value?.tasks.filter(task => task.status === 'canceled') ?? []);
const countOf = (status: TaskStatus) => current.value?.tasks.filter(task => task.status === status).length ?? 0;
const counts = computed(() => ({ open: countOf('open'), inProgress: countOf('in_progress'), done: countOf('done') }));
const total = computed(() => counts.value.open + counts.value.inProgress + counts.value.done);
const editTargets = computed(() => {
  for (const list of lists.value) {
    const task = list.tasks.find(item => item.id === editing.value);
    if (task) return [{ list, task }];
  }
  return [];
});

// Cards glide to their new place when a poll or an edit changes the board (FLIP): the
// positions are read before Vue patches the DOM and animated from there afterwards. A
// card that changes column is a new element, so cards are matched by `data-task-id`.
const root = ref<HTMLElement>();
let reduceMotion = false;
type Snapshot = Map<string, { rect: DOMRect; status?: string; ready?: string; review?: string }>;
const cardElements = () => [...(root.value?.querySelectorAll<HTMLElement>('[data-task-id]') ?? [])];
function capture(): Snapshot {
  return new Map(cardElements().map(el => [el.dataset.taskId!, { rect: el.getBoundingClientRect(), status: el.dataset.status, ready: el.dataset.ready, review: el.dataset.review }]));
}
const ease = 'cubic-bezier(0.2, 0, 0, 1)';
function play(before: Snapshot) {
  if (reduceMotion || !before.size) return;
  for (const el of cardElements()) {
    const was = before.get(el.dataset.taskId!);
    if (!was) {
      el.animate([{ opacity: 0, transform: 'translateY(-6px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: ease });
      continue;
    }
    const now = el.getBoundingClientRect();
    const dx = was.rect.left - now.left, dy = was.rect.top - now.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
      el.style.zIndex = '2';
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: ease })
        .finished.then(() => { el.style.zIndex = ''; }, () => { el.style.zIndex = ''; });
    }
    const glow = el.dataset.status === 'done' && was.status !== 'done' ? 'success'
      : Number(el.dataset.review) > Number(was.review) ? 'warning'
        : (el.dataset.status === 'in_progress' && was.status !== 'in_progress') || (el.dataset.ready === '1' && was.ready !== '1') ? 'primary' : null;
    if (glow) {
      el.classList.remove('glow-success', 'glow-warning', 'glow-primary');
      void el.offsetWidth;
      el.classList.add(`glow-${glow}`);
      setTimeout(() => el.classList.remove(`glow-${glow}`), 1700);
    }
  }
}
watch([board, () => current.value?.id, showCanceled], () => {
  if (!import.meta.client) return;
  const before = capture();
  nextTick(() => play(before));
}, { flush: 'pre' });
onMounted(() => { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; });
</script>

<template>
  <div ref="root" class="task-board" :class="variant === 'page' ? 'page-inner wide' : 'panel'">
    <AppLoading v-if="!board && !tasks.state.value.error" />
    <template v-else>
      <AppNotice v-if="error ?? tasks.state.value.error">{{ error ?? tasks.state.value.error }}</AppNotice>

      <div v-if="variant === 'page' || lists.length > 1" class="task-board-top">
        <div v-if="lists.length" class="task-board-lists" role="group" :aria-label="$t('miniapps.tasks.board.lists')">
          <button
            v-for="list in lists" :key="list.id" type="button" class="task-list-chip" :aria-pressed="list.id === current?.id"
            @click="selectedListID = list.id"
          >
            {{ list.title }}<span v-if="list.status === 'canceled'" class="task-list-chip-state">· {{ $t('miniapps.tasks.canceled') }}</span>
          </button>
        </div>
        <form v-if="variant === 'page'" class="task-board-new task-inline-form" @submit.prevent="createList">
          <input v-model="newList" type="text" maxlength="200" :placeholder="$t('miniapps.tasks.newList')" :aria-label="$t('miniapps.tasks.newListTitle')">
          <button type="submit" class="link-button" :disabled="busy || !newList.trim()">{{ $t('common.create') }}</button>
        </form>
      </div>
      <p v-if="!lists.length" class="group-footer">{{ $t('miniapps.tasks.intro') }}</p>

      <template v-if="current">
        <div class="task-board-progress">
          <strong>{{ total ? $t('miniapps.tasks.board.progress', { done: counts.done, total }) : $t('miniapps.tasks.board.noTasks') }}</strong>
          <div class="task-board-bar" role="img" :aria-label="$t('miniapps.tasks.board.progressDetail', { open: counts.open, inProgress: counts.inProgress, done: counts.done })">
            <span class="open" :style="{ flexGrow: counts.open }" />
            <span class="in_progress" :style="{ flexGrow: counts.inProgress }" />
            <span class="done" :style="{ flexGrow: counts.done }" />
          </div>
          <AppButton v-if="variant === 'page' && current.status === 'active'" variant="danger-text" size="small" :disabled="busy" @click="cancelList(current)">
            {{ $t('miniapps.tasks.cancelList') }}
          </AppButton>
        </div>

        <div class="task-lanes">
          <section v-for="lane in lanes" :key="lane.status" class="task-lane" :class="lane.status" :aria-label="$t(`miniapps.tasks.board.lanes.${lane.status}`)">
            <h3 class="task-lane-head">{{ $t(`miniapps.tasks.board.lanes.${lane.status}`) }}<span class="task-lane-count">{{ lane.tasks.length }}</span></h3>
            <p v-if="!lane.tasks.length" class="task-lane-empty">{{ $t('miniapps.tasks.board.empty') }}</p>
            <TaskCard
              v-for="task in lane.tasks" :key="task.id" :task="task" :list="current" :compact="variant === 'panel'" :busy="busy"
              @toggle="toggle(task)" @edit="edit(task)"
            />
            <form v-if="variant === 'page' && lane.status === 'open' && current.status === 'active'" class="task-lane-add task-inline-form" @submit.prevent="addTask(current)">
              <input v-model="drafts[current.id]" type="text" maxlength="300" :placeholder="$t('miniapps.tasks.addTask')" :aria-label="$t('miniapps.tasks.addTaskTo', { list: current.title })">
              <button type="submit" class="link-button" :disabled="busy || !drafts[current.id]?.trim()">{{ $t('common.add') }}</button>
            </form>
            <div v-if="lane.status === 'done' && canceledTasks.length" class="task-lane-canceled">
              <button type="button" class="link-button task-lane-canceled-toggle" :aria-expanded="showCanceled" @click="showCanceled = !showCanceled">
                <AppIcon :name="showCanceled ? 'expand' : 'chevron'" />{{ $t('miniapps.tasks.board.canceledCount', { count: canceledTasks.length }) }}
              </button>
              <template v-if="showCanceled">
                <TaskCard v-for="task in canceledTasks" :key="task.id" :task="task" :list="current" compact :busy="busy" @toggle="toggle(task)" @edit="edit(task)" />
              </template>
            </div>
          </section>
        </div>
      </template>

      <template v-for="{ task, list } in editTargets" :key="task.id">
            <AppSheet :title="$t('miniapps.tasks.task')" @close="editing = null">
            <form :id="`task-form-${task.id}`" class="task-editor group" @submit.prevent="save(task)">
              <div class="field"><label :for="`title-${task.id}`">{{ $t('miniapps.tasks.fields.title') }}</label><input :id="`title-${task.id}`" v-model="form.title" type="text" maxlength="300" required></div>
              <div class="field"><label :for="`status-${task.id}`">{{ $t('miniapps.tasks.fields.status') }}</label><AppSelect :id="`status-${task.id}`" v-model="form.status" variant="plain" :options="statusOptions" /></div>
              <div class="field"><label :for="`assignee-${task.id}`">{{ $t('miniapps.tasks.fields.assignee') }}</label><AppSelect :id="`assignee-${task.id}`" v-model="form.assignee" variant="plain" :options="assigneeOptions" /></div>
              <div class="field"><label :for="`notes-${task.id}`">{{ $t('miniapps.tasks.fields.notes') }}</label><textarea :id="`notes-${task.id}`" v-model="form.notes" rows="2" maxlength="2000" /></div>
              <div class="field"><label :for="`next-${task.id}`">{{ $t('miniapps.tasks.fields.nextStep') }}</label><textarea :id="`next-${task.id}`" v-model="form.nextStep" rows="2" maxlength="2000" /></div>
              <div class="field"><label :for="`evidence-${task.id}`">{{ $t('miniapps.tasks.fields.evidence') }}</label><textarea :id="`evidence-${task.id}`" v-model="form.evidence" rows="2" maxlength="2000" /></div>
              <div v-if="task.workState === 'blocked'" class="field"><label :for="`blocked-${task.id}`">{{ $t('miniapps.tasks.fields.blockedReason') }}</label><textarea :id="`blocked-${task.id}`" v-model="form.blockedReason" rows="2" maxlength="2000" /></div>
              <div v-if="task.assigneeKind === 'agent' || task.researchUsed" class="field">
                <span class="info-title"><label :for="`research-${task.id}`">{{ $t('miniapps.tasks.research.title') }}</label><InfoButton :label="$t('miniapps.tasks.research.title')" :text="$t('miniapps.tasks.research.info')" /></span>
                <textarea :id="`research-${task.id}`" v-model="form.researchQuery" rows="2" maxlength="600" :placeholder="$t('miniapps.tasks.research.placeholder')" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'" />
                <p class="small">{{ researchDetail(task) }}</p>
                <p class="small muted">{{ $t('miniapps.tasks.research.note') }}</p>
              </div>
              <div v-if="task.assigneeKind === 'agent' || task.monitorURL || task.monitorTurnsUsed" class="field">
                <span class="info-title"><label :for="`monitor-${task.id}`">{{ $t('miniapps.tasks.monitor.title') }}</label><InfoButton :label="$t('miniapps.tasks.monitor.title')" :text="$t('miniapps.tasks.monitor.info')" /></span>
                <input :id="`monitor-${task.id}`" v-model="form.monitorURL" type="url" maxlength="2048" placeholder="https://example.com/page" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'">
                <AppSelect v-model="form.monitorInterval" variant="plain" :aria-label="$t('miniapps.tasks.monitor.frequency')" :options="monitorIntervals" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'" />
                <input v-model="form.monitorKeywords" type="text" maxlength="300" :placeholder="$t('miniapps.tasks.monitor.keywords')" :aria-label="$t('miniapps.tasks.monitor.keywordsLabel')" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'">
                <p class="small">{{ monitorDetail(task) }}</p>
                <ul v-if="task.monitorChecks?.length" class="small task-monitor-checks"><li v-for="check in task.monitorChecks" :key="check.checkedAt">{{ checkLabel(check) }}</li></ul>
                <p class="small muted">{{ $t('miniapps.tasks.monitor.note') }}</p>
              </div>
              <div v-if="task.assigneeKind === 'agent' && task.workState && !['done', 'canceled'].includes(task.status)" class="task-actions">
                <InfoButton :label="$t('miniapps.tasks.work.label')" :text="$t('miniapps.tasks.work.info')" />
                <AppButton v-if="task.workState === 'active'" variant="tonal" :disabled="busy" @click="controlWork(task, 'paused')">{{ $t('miniapps.tasks.work.pause') }}</AppButton>
                <AppButton v-else variant="tonal" :disabled="busy || task.workUsed >= task.workLimit" @click="controlWork(task, 'active')">{{ $t('miniapps.tasks.work.resume') }}</AppButton>
                <AppButton variant="tonal" :disabled="busy" @click="run(async () => { await tasks.updateTask(task.id, originalTask(task).version, { status: 'canceled' }); editing = null; })">{{ $t('miniapps.tasks.work.cancelTask') }}</AppButton>
              </div>
              <fieldset v-if="list.tasks.length > 1" class="task-blockers">
                <legend class="small muted">{{ $t('miniapps.tasks.waitsFor') }}</legend>
                <label v-for="other in list.tasks.filter(t => t.id !== task.id)" :key="other.id" class="small">
                  <input v-model="form.blockedBy" type="checkbox" :value="other.id"> {{ other.title }}
                </label>
              </fieldset>
            </form>
            <template #actions>
              <AppButton variant="text" :disabled="busy" @click="editing = null">{{ $t('common.close') }}</AppButton>
              <AppButton type="submit" :form="`task-form-${task.id}`" :disabled="busy || !form.title.trim() || form.monitorKeywords.trim().length > 300">{{ $t('common.save') }}</AppButton>
            </template>
            </AppSheet>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* The board is its own size container: columns while it is wide, sections below. */
.task-board { container-type: inline-size; display: flex; flex-direction: column; gap: var(--space-4); }
.task-board.panel { gap: var(--space-3); }
.task-board-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.task-board-lists { display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 1 1 320px; min-width: 0; }
.task-list-chip {
  display: inline-flex; align-items: center; gap: var(--space-1); min-height: 32px; padding: 0 var(--space-3);
  border: 1px solid var(--md-outline-variant); border-radius: var(--md-shape-s); background: transparent;
  color: var(--md-on-surface-variant); font: var(--type-label-large); cursor: pointer;
}
.task-list-chip:hover { background: var(--hover); }
.task-list-chip[aria-pressed='true'] { border-color: transparent; background: var(--md-primary-container); color: var(--md-on-primary-container); }
.task-list-chip-state { font-weight: 500; }
.task-board-new { flex: 0 1 320px; }
.task-inline-form { display: flex; align-items: center; gap: var(--space-1); margin: 0; }
.task-inline-form input {
  flex: 1; min-width: 0; height: 36px; padding: 0 var(--space-3); border: 1px solid var(--md-outline-variant); border-radius: var(--md-shape-s);
  background: var(--md-surface-container-lowest); color: var(--md-on-surface); font: var(--type-body-medium);
}
.task-inline-form input:focus-visible { outline: 2px solid var(--md-primary); outline-offset: -1px; border-color: transparent; }
.task-board-progress { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
.task-board-progress strong { font: var(--type-title-small); font-variant-numeric: tabular-nums; }
.task-board-bar { display: flex; gap: 3px; flex: 1 1 200px; height: 8px; min-width: 120px; }
.panel .task-board-bar { flex-basis: 100%; height: 6px; }
.task-board-bar span { flex-basis: 0; min-width: 0; border-radius: 4px; transition: flex-grow 600ms cubic-bezier(0.2, 0, 0, 1); }
.task-board-bar .open { background: var(--md-outline-variant); }
.task-board-bar .in_progress { background: var(--md-primary); }
.task-board-bar .done { background: var(--md-success); }
.task-lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); align-items: start; }
.task-lane {
  display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; min-height: 360px; padding: var(--space-2);
  border-radius: var(--md-shape-l); background: var(--md-surface-container);
}
.task-lane-head { display: flex; align-items: center; gap: var(--space-2); margin: 0; padding: var(--space-1) var(--space-1-5) 0; font: var(--type-title-small); color: var(--md-on-surface-variant); }
.task-lane-count {
  display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 6px; border-radius: 10px;
  background: var(--md-surface-container-highest); font: var(--type-label-small); font-variant-numeric: tabular-nums;
}
.task-lane-empty { margin: 0; padding: var(--space-4) var(--space-2); border: 1px dashed var(--md-outline-variant); border-radius: var(--md-shape-m); text-align: center; font: var(--type-body-small); color: var(--md-on-surface-variant); }
.task-lane-add { margin: 0; }
.task-lane-canceled { display: flex; flex-direction: column; gap: var(--space-2); }
.task-lane-canceled-toggle { align-self: flex-start; color: var(--md-on-surface-variant); }
/* Narrow: one column of sections, what is moving now first. */
@container (max-width: 599px) {
  .task-lanes { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .task-lane { min-height: 0; padding: 0; background: none; border-radius: 0; }
  .task-board:not(.panel) .task-lane.in_progress { order: -1; }
}
@media (prefers-reduced-motion: reduce) { .task-board-bar span { transition: none; } }
</style>
