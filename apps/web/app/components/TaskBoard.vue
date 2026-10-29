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
const form = reactive({ title: '', notes: '', status: 'open' as TaskStatus, assignee: '', blockedBy: [] as string[] });

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
const taskTitle = (list: TaskList, id: string) => list.tasks.find(task => task.id === id)?.title ?? 'a removed task';

function detail(list: TaskList, task: TaskItem) {
  const parts = [task.assigneeName ?? 'Unassigned'];
  if (task.status !== 'open') parts.push(statusLabels[task.status]);
  if (task.blocked) parts.push(`Waiting for ${task.blockedBy.filter(id => ['open', 'in_progress'].includes(list.tasks.find(t => t.id === id)?.status ?? '')).map(id => taskTitle(list, id)).join(', ')}`);
  return parts.join(' · ');
}
function edit(task: TaskItem) {
  if (editing.value === task.id) { editing.value = null; return; }
  editing.value = task.id;
  Object.assign(form, { title: task.title, notes: task.notes ?? '', status: task.status,
    assignee: task.assigneeKind ? `${task.assigneeKind}:${task.assigneeID}` : '', blockedBy: [...task.blockedBy] });
}
const toggle = (task: TaskItem) => run(() => tasks.updateTask(task.id, task.version, { status: task.status === 'done' ? 'open' : 'done' }));
const save = (task: TaskItem) => run(async () => {
  await tasks.updateTask(task.id, task.version, { title: form.title.trim(), notes: form.notes.trim() || null, status: form.status,
    assignee: assignee(form.assignee), blockedBy: form.blockedBy });
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
                <span class="task-title">{{ task.title }}</span>
                <span class="small muted">{{ detail(list, task) }}</span>
                <span v-if="task.result" class="small task-result">{{ task.result }}</span>
              </button>
            </div>
            <form v-if="editing === task.id" class="task-editor" @submit.prevent="save(task)">
              <div class="field"><label :for="`title-${task.id}`">Title</label><input :id="`title-${task.id}`" v-model="form.title" type="text" maxlength="300" required></div>
              <div class="field"><label :for="`status-${task.id}`">Status</label><AppSelect :id="`status-${task.id}`" v-model="form.status" variant="plain" :options="statusOptions" /></div>
              <div class="field"><label :for="`assignee-${task.id}`">Assignee</label><AppSelect :id="`assignee-${task.id}`" v-model="form.assignee" variant="plain" :options="assigneeOptions" /></div>
              <div class="field"><label :for="`notes-${task.id}`">Notes</label><textarea :id="`notes-${task.id}`" v-model="form.notes" rows="2" maxlength="2000" /></div>
              <fieldset v-if="list.tasks.length > 1" class="task-blockers">
                <legend class="small muted">Waits for</legend>
                <label v-for="other in list.tasks.filter(t => t.id !== task.id)" :key="other.id" class="small">
                  <input v-model="form.blockedBy" type="checkbox" :value="other.id"> {{ other.title }}
                </label>
              </fieldset>
              <div class="task-actions">
                <button type="button" class="button secondary" :disabled="busy" @click="editing = null">Close</button>
                <button type="submit" class="button" :disabled="busy || !form.title.trim()">Save</button>
              </div>
            </form>
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
