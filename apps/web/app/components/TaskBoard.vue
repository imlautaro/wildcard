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

const researchLabels: Record<string, string> = { pending: 'Pending or uncertain', ready: 'Draft saved', stopped: 'Stopped before publication', complete: 'Report saved', failed: 'Failed' };
const researchDetail = (task: TaskItem) => `${task.researchUsed ?? 0}/${task.researchLimit ?? 1} web research attempts used${task.researchStatus ? ` · ${researchLabels[task.researchStatus] ?? task.researchStatus}` : ''}`;
const monitorIntervals = [{ value: 60, label: 'Every hour' }, { value: 360, label: 'Every 6 hours' }, { value: 1440, label: 'Every day' }];
const monitorLabels: Record<string, string> = { baseline: 'First check saved', unchanged: 'Unchanged', repeated: 'Earlier version again', ignored: 'Changed, no keyword match', changed: 'Relevant change', failed: 'Check failed' };
const checkLabel = (check: TaskItem['monitorChecks'][number]) => `${monitorLabels[check.outcome] ?? check.outcome}${check.errorCode ? ` (${check.errorCode}${check.httpStatus ? ` ${check.httpStatus}` : ''})` : ''} · ${new Date(check.checkedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
const monitorDetail = (task: TaskItem) => {
  const last = task.monitorChecks?.[0];
  return [task.monitorURL ? `Page monitor · ${monitorIntervals.find(option => option.value === task.monitorInterval)?.label.toLowerCase() ?? ''}` : 'Page monitor removed',
    `${task.monitorTurnsUsed ?? 0}/${task.monitorTurnLimit ?? 20} change turns used`, task.monitorPending ? 'Change waiting for a turn' : '',
    last ? `Last: ${checkLabel(last)}` : task.monitorURL ? 'Not checked yet' : ''].filter(Boolean).join(' · ');
};
const originalTask = (task: TaskItem) => editingTask.value?.id === task.id ? editingTask.value : task;
const assignmentChanged = (task: TaskItem) => {
  const original = originalTask(task);
  return form.assignee !== (original.assigneeKind ? `${original.assigneeKind}:${original.assigneeID}` : '');
};
const statusLabels: Record<TaskStatus, string> = { open: 'To do', in_progress: 'In progress', done: 'Done', canceled: 'Canceled' };
const statusOptions = (Object.keys(statusLabels) as TaskStatus[]).map(value => ({ value, label: statusLabels[value] }));
const assigneeOptions = computed(() => [{ value: '', label: 'Unassigned' },
  ...(board.value?.members ?? []).map(member => ({ value: `${member.kind}:${member.id}`, label: member.kind === 'user' && member.id === useSession().user.value?.id ? `${member.name} (You)` : member.name }))]);

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
const workLabel = (task: TaskItem) => task.workState === 'paused' ? 'Paused' : task.workState === 'blocked' ? 'Blocked' : task.workUsed >= task.workLimit ? 'Budget exhausted' : null;
const controlWork = (task: TaskItem, workState: 'active' | 'paused') => run(async () => {
  await tasks.updateTask(task.id, originalTask(task).version, { workState });
  editing.value = null;
});
const taskTitle = (list: TaskList, id: string) => list.tasks.find(task => task.id === id)?.title ?? 'a removed task';

function detail(list: TaskList, task: TaskItem) {
  const parts = [task.assigneeName ?? 'Unassigned'];
  if (task.status !== 'open') parts.push(statusLabels[task.status]);
  if (task.assigneeKind === 'agent') {
    if (workLabel(task) && !['done', 'canceled'].includes(task.status)) parts.push(workLabel(task)!);
    if (task.workUsed != null && task.workLimit != null) parts.push(`${task.workUsed}/${task.workLimit} work turns used`);
  }
  if (task.blocked) parts.push(`Waiting for ${task.blockedBy.filter(id => ['open', 'in_progress'].includes(list.tasks.find(t => t.id === id)?.status ?? '')).map(id => taskTitle(list, id)).join(', ')}`);
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
  if (!window.confirm(`Cancel “${list.title}” and every unfinished task in it? Contacts stop working on them.`)) return;
  await tasks.cancelList(list.id);
});
</script>

<template>
  <div class="page-inner">
    <div v-if="!board && !tasks.state.value.error" class="center"><span class="spinner" /> Loading…</div>
    <template v-else>
      <p v-if="error ?? tasks.state.value.error" class="notice" style="margin: 0 0 12px">{{ error ?? tasks.state.value.error }}</p>
      <form class="group" @submit.prevent="createList">
        <div class="field">
          <input v-model="newList" type="text" maxlength="200" placeholder="New list" aria-label="New list title">
          <button type="submit" class="link-button" :disabled="busy || !newList.trim()">Create</button>
        </div>
      </form>
      <p v-if="!board?.lists.length" class="group-footer">Lists keep shared work in this chat. Contacts can create them, take tasks, wait for blockers, and report results. You can also ask in the chat, for example “Split the trip planning into tasks.”</p>

      <template v-for="list in board?.lists ?? []" :key="list.id">
        <div class="group-title task-list-title">
          <span>{{ list.title }}</span>
          <span v-if="list.status === 'canceled'" class="chip">Canceled</span>
          <span v-else class="small muted">{{ list.tasks.filter(t => t.status === 'done').length }}/{{ list.tasks.filter(t => t.status !== 'canceled').length }}</span>
        </div>
        <div class="group">
          <div v-for="task in list.tasks" :key="task.id" class="task-row" :class="{ finished: ['done', 'canceled'].includes(task.status) }">
            <div class="task-line">
              <button type="button" class="icon-button task-check" :disabled="busy || list.status === 'canceled' || task.status === 'canceled'"
                :aria-label="task.status === 'done' ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`" @click="toggle(task)">
                <AppIcon :name="task.status === 'done' ? 'check' : task.status === 'canceled' ? 'block' : task.blocked ? 'clock' : 'circle'" :filled="task.status === 'done'" />
              </button>
              <button type="button" class="task-copy link-button" :disabled="list.status === 'canceled'" @click="edit(task)">
                <span class="task-title">{{ task.title }}<span v-if="task.assigneeKind === 'agent' && task.status === 'in_progress' && !workLabel(task)" class="chip primary task-working"><span class="live-dot" aria-hidden="true" />Working</span></span>
                <span class="small muted">{{ detail(list, task) }}</span>
                <span v-if="task.nextStep" class="small">Next step: {{ task.nextStep }}</span>
                <span v-if="task.blockedReason" class="small">Blocked: {{ task.blockedReason }}</span>
                <span v-if="task.researchQuery || task.researchUsed" class="small">{{ researchDetail(task) }}</span>
                <span v-if="task.monitorURL || task.monitorTurnsUsed" class="small">{{ monitorDetail(task) }}</span>
                <span v-if="task.documentID" class="small">Deliverable: {{ task.documentTitle ?? 'a document' }}</span>
                <span v-if="task.reviewRounds" class="small">Revision round {{ task.reviewRounds }}/{{ task.reviewRoundLimit ?? 2 }}<template v-if="task.reviewFeedback && !['done', 'canceled'].includes(task.status)">: {{ task.reviewFeedback }}</template></span>
                <span v-if="task.result" class="small task-result">{{ task.result }}</span>
              </button>
            </div>
            <AppSheet v-if="editing === task.id" title="Task" @close="editing = null">
            <form :id="`task-form-${task.id}`" class="task-editor group" @submit.prevent="save(task)">
              <div class="field"><label :for="`title-${task.id}`">Title</label><input :id="`title-${task.id}`" v-model="form.title" type="text" maxlength="300" required></div>
              <div class="field"><label :for="`status-${task.id}`">Status</label><AppSelect :id="`status-${task.id}`" v-model="form.status" variant="plain" :options="statusOptions" /></div>
              <div class="field"><label :for="`assignee-${task.id}`">Assignee</label><AppSelect :id="`assignee-${task.id}`" v-model="form.assignee" variant="plain" :options="assigneeOptions" /></div>
              <div class="field"><label :for="`notes-${task.id}`">Notes</label><textarea :id="`notes-${task.id}`" v-model="form.notes" rows="2" maxlength="2000" /></div>
              <div class="field"><label :for="`next-${task.id}`">Next step</label><textarea :id="`next-${task.id}`" v-model="form.nextStep" rows="2" maxlength="2000" /></div>
              <div class="field"><label :for="`evidence-${task.id}`">Evidence</label><textarea :id="`evidence-${task.id}`" v-model="form.evidence" rows="2" maxlength="2000" /></div>
              <div v-if="task.workState === 'blocked'" class="field"><label :for="`blocked-${task.id}`">Blocked reason</label><textarea :id="`blocked-${task.id}`" v-model="form.blockedReason" rows="2" maxlength="2000" /></div>
              <div v-if="task.assigneeKind === 'agent' || task.researchUsed" class="field">
                <span class="info-title"><label :for="`research-${task.id}`">Public web research</label><InfoButton label="Public web research" text="Saving this query authorizes one public search with the app closed. Only this exact query is sent; use public information. Leave empty to revoke. Failed or uncertain attempts count. Daily limits also apply. Changing assignee clears permission; save the assignment first. Reports appear in Docs." /></span>
                <textarea :id="`research-${task.id}`" v-model="form.researchQuery" rows="2" maxlength="600" placeholder="Exact public query" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'" />
                <p class="small">{{ researchDetail(task) }}</p>
                <p class="small muted">Saving authorizes one public search with the app closed.</p>
              </div>
              <div v-if="task.assigneeKind === 'agent' || task.monitorURL || task.monitorTurnsUsed" class="field">
                <span class="info-title"><label :for="`monitor-${task.id}`">Page monitor</label><InfoButton label="Page monitor" text="Saving a public page lets the server check it with the app closed, without the model. The contact gets a turn only when the page text changes (and matches a keyword, if set), up to 3 per day and 20 in total. Redirects are not followed; save the final address. Leave empty to remove. Changing assignee removes the monitor; save the assignment first. Pausing or finishing the task stops checks." /></span>
                <input :id="`monitor-${task.id}`" v-model="form.monitorURL" type="url" maxlength="2048" placeholder="https://example.com/page" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'">
                <AppSelect v-model="form.monitorInterval" variant="plain" aria-label="Check frequency" :options="monitorIntervals" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'" />
                <input v-model="form.monitorKeywords" type="text" maxlength="300" placeholder="Keywords, comma-separated (optional)" aria-label="Monitor keywords" :disabled="assignmentChanged(task) || task.assigneeKind !== 'agent'">
                <p class="small">{{ monitorDetail(task) }}</p>
                <ul v-if="task.monitorChecks?.length" class="small task-monitor-checks"><li v-for="check in task.monitorChecks" :key="check.checkedAt">{{ checkLabel(check) }}</li></ul>
                <p class="small muted">Saving lets the server check this page with the app closed.</p>
              </div>
              <div v-if="task.assigneeKind === 'agent' && task.workState && !['done', 'canceled'].includes(task.status)" class="task-actions">
                <InfoButton label="Work" text="Work continues with the app closed. Pausing stops new steps and replies; a step already started may finish. Resuming keeps the remaining budget." />
                <button v-if="task.workState === 'active'" type="button" class="button secondary" :disabled="busy" @click="controlWork(task, 'paused')">Pause work</button>
                <button v-else type="button" class="button secondary" :disabled="busy || task.workUsed >= task.workLimit" @click="controlWork(task, 'active')">Resume work</button>
                <button type="button" class="button secondary" :disabled="busy" @click="run(async () => { await tasks.updateTask(task.id, originalTask(task).version, { status: 'canceled' }); editing = null; })">Cancel task</button>
              </div>
              <fieldset v-if="list.tasks.length > 1" class="task-blockers">
                <legend class="small muted">Waits for</legend>
                <label v-for="other in list.tasks.filter(t => t.id !== task.id)" :key="other.id" class="small">
                  <input v-model="form.blockedBy" type="checkbox" :value="other.id"> {{ other.title }}
                </label>
              </fieldset>
            </form>
            <template #actions>
              <button type="button" class="button text" :disabled="busy" @click="editing = null">Close</button>
              <button type="submit" :form="`task-form-${task.id}`" class="button" :disabled="busy || !form.title.trim() || form.monitorKeywords.trim().length > 300">Save</button>
            </template>
            </AppSheet>
          </div>
          <form v-if="list.status === 'active'" class="field" @submit.prevent="addTask(list)">
            <input v-model="drafts[list.id]" type="text" maxlength="300" placeholder="Add a task" :aria-label="`Add a task to ${list.title}`">
            <button type="submit" class="link-button" :disabled="busy || !drafts[list.id]?.trim()">Add</button>
          </form>
        </div>
        <button v-if="list.status === 'active'" type="button" class="link-button danger small task-cancel" :disabled="busy" @click="cancelList(list)">Cancel list</button>
      </template>
    </template>
  </div>
</template>
