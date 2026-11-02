<script setup lang="ts">
import type { TaskItem, TaskList, TaskStatus } from '~/utils/types';

// Shared to-do lists of one chat. `base` is `contacts/:id` or `groups/:id`.
const props = defineProps<{ base: string }>();
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
const workLabel = (task: TaskItem) => task.workState === 'paused' ? t('miniapps.tasks.work.paused') : task.workState === 'blocked' ? t('miniapps.tasks.work.blocked') : task.workUsed >= task.workLimit ? t('miniapps.tasks.work.exhausted') : null;
const controlWork = (task: TaskItem, workState: 'active' | 'paused') => run(async () => {
  await tasks.updateTask(task.id, originalTask(task).version, { workState });
  editing.value = null;
});
const taskTitle = (list: TaskList, id: string) => list.tasks.find(task => task.id === id)?.title ?? t('miniapps.tasks.aRemovedTask');

function detail(list: TaskList, task: TaskItem) {
  const parts = [task.assigneeName ?? t('miniapps.tasks.unassigned')];
  if (task.status !== 'open') parts.push(statusLabel(task.status));
  if (task.assigneeKind === 'agent') {
    if (workLabel(task) && !['done', 'canceled'].includes(task.status)) parts.push(workLabel(task)!);
    if (task.workUsed != null && task.workLimit != null) parts.push(t('miniapps.tasks.work.turns', { used: task.workUsed, limit: task.workLimit }));
  }
  if (task.blocked) parts.push(t('miniapps.tasks.waitingFor', { tasks: nameList(task.blockedBy.filter(id => ['open', 'in_progress'].includes(list.tasks.find(item => item.id === id)?.status ?? '')).map(id => taskTitle(list, id))) }));
  return parts.join(' · ');
}
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
</script>

<template>
  <div class="page-inner">
    <AppLoading v-if="!board && !tasks.state.value.error" />
    <template v-else>
      <AppNotice v-if="error ?? tasks.state.value.error">{{ error ?? tasks.state.value.error }}</AppNotice>
      <form class="group" @submit.prevent="createList">
        <div class="field">
          <input v-model="newList" type="text" maxlength="200" :placeholder="$t('miniapps.tasks.newList')" :aria-label="$t('miniapps.tasks.newListTitle')">
          <button type="submit" class="link-button" :disabled="busy || !newList.trim()">{{ $t('common.create') }}</button>
        </div>
      </form>
      <p v-if="!board?.lists.length" class="group-footer">{{ $t('miniapps.tasks.intro') }}</p>

      <template v-for="list in board?.lists ?? []" :key="list.id">
        <AppListGroup>
          <template #title>
            <span class="task-list-name">{{ list.title }}</span>
            <AppChip v-if="list.status === 'canceled'">{{ $t('miniapps.tasks.canceled') }}</AppChip>
            <span v-else class="small muted">{{ list.tasks.filter(t => t.status === 'done').length }}/{{ list.tasks.filter(t => t.status !== 'canceled').length }}</span>
          </template>
          <div v-for="task in list.tasks" :key="task.id" class="task-row" :class="{ finished: ['done', 'canceled'].includes(task.status) }">
            <div class="task-line">
              <!-- Raw markup: AppIconButton only fills its glyph through `selected`, which would add aria-pressed. -->
              <button type="button" class="icon-button task-check" :disabled="busy || list.status === 'canceled' || task.status === 'canceled'"
                :aria-label="task.status === 'done' ? $t('miniapps.tasks.markNotDone', { title: task.title }) : $t('miniapps.tasks.markDone', { title: task.title })" @click="toggle(task)">
                <AppIcon :name="task.status === 'done' ? 'check' : task.status === 'canceled' ? 'block' : task.blocked ? 'clock' : 'circle'" :filled="task.status === 'done'" />
              </button>
              <button type="button" class="task-copy link-button" :disabled="list.status === 'canceled'" @click="edit(task)">
                <span class="task-title">{{ task.title }}<AppChip v-if="task.assigneeKind === 'agent' && task.status === 'in_progress' && !workLabel(task)" tone="primary" class="task-working"><span class="live-dot" aria-hidden="true" />{{ $t('miniapps.tasks.working') }}</AppChip></span>
                <span class="small muted">{{ detail(list, task) }}</span>
                <span v-if="task.nextStep" class="small">{{ $t('miniapps.tasks.nextStep', { text: task.nextStep }) }}</span>
                <span v-if="task.blockedReason" class="small">{{ $t('miniapps.tasks.blocked', { text: task.blockedReason }) }}</span>
                <span v-if="task.researchQuery || task.researchUsed" class="small">{{ researchDetail(task) }}</span>
                <span v-if="task.monitorURL || task.monitorTurnsUsed" class="small">{{ monitorDetail(task) }}</span>
                <span v-if="task.documentID" class="small">{{ $t('miniapps.tasks.deliverable', { title: task.documentTitle ?? $t('miniapps.tasks.aDocument') }) }}</span>
                <span v-if="task.reviewRounds" class="small">{{ task.reviewFeedback && !['done', 'canceled'].includes(task.status)
                  ? $t('miniapps.tasks.revisionRoundFeedback', { round: task.reviewRounds, limit: task.reviewRoundLimit ?? 2, feedback: task.reviewFeedback })
                  : $t('miniapps.tasks.revisionRound', { round: task.reviewRounds, limit: task.reviewRoundLimit ?? 2 }) }}</span>
                <span v-if="task.result" class="small task-result">{{ task.result }}</span>
              </button>
            </div>
            <AppSheet v-if="editing === task.id" :title="$t('miniapps.tasks.task')" @close="editing = null">
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
          </div>
          <form v-if="list.status === 'active'" class="field" @submit.prevent="addTask(list)">
            <input v-model="drafts[list.id]" type="text" maxlength="300" :placeholder="$t('miniapps.tasks.addTask')" :aria-label="$t('miniapps.tasks.addTaskTo', { list: list.title })">
            <button type="submit" class="link-button" :disabled="busy || !drafts[list.id]?.trim()">{{ $t('common.add') }}</button>
          </form>
        </AppListGroup>
        <div v-if="list.status === 'active'" class="actions-row">
          <AppButton variant="danger-text" size="small" :disabled="busy" @click="cancelList(list)">{{ $t('miniapps.tasks.cancelList') }}</AppButton>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.task-list-name { flex: 1; min-width: 0; }
</style>
