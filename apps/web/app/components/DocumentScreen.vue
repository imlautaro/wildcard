<script setup lang="ts">
import { DocumentConflict } from '~/composables/useDocuments';

// A document opens as its own screen: the rendered Markdown, an editor with preview,
// recent revisions, and delete. `base` is `contacts/:id` or `groups/:id`.
const props = defineProps<{ base: string; documentId: string; back: string }>();
const documents = useDocuments(() => props.base);
const entry = computed(() => documents.document(props.documentId));
const doc = computed(() => entry.value.value);
const editing = ref(false);
const preview = ref(false);
const showHistory = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const conflict = ref<string | null>(null);
const draft = reactive({ title: '', body: '', baseRevision: 0, summary: '' });
const modes: { value: boolean; label: string }[] = [{ value: false, label: 'Write' }, { value: true, label: 'Preview' }];

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  documents.load(props.documentId, true);
  // Contacts may be editing; keep the viewer current, but never replace an open draft.
  timer = setInterval(() => { if (!editing.value && document.visibilityState === 'visible') documents.load(props.documentId); }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
onBeforeRouteLeave(() => !editing.value || !changed.value || window.confirm('Discard your unsaved changes?'));
const changed = computed(() => !!doc.value && (draft.title !== doc.value.title || draft.body !== doc.value.body));

function startEditing() {
  if (!doc.value) return;
  Object.assign(draft, { title: doc.value.title, body: doc.value.body, baseRevision: doc.value.revision, summary: '' });
  conflict.value = null; preview.value = false; editing.value = true;
}
async function save() {
  if (busy.value || !draft.title.trim()) return;
  busy.value = true; error.value = null;
  try {
    await documents.save(props.documentId, draft.baseRevision, draft.title.trim(), draft.body, draft.summary.trim() || undefined);
    editing.value = false; conflict.value = null;
  } catch (failure) {
    if (failure instanceof DocumentConflict) {
      conflict.value = `${failure.current?.updatedByName ?? 'Someone'} saved a newer version (revision ${failure.current?.revision ?? '?'}) while you were editing.`;
    } else error.value = errorMessage(failure);
  } finally { busy.value = false; }
}
// Keep my text and save it over the newer revision.
function keepMine() { if (doc.value) draft.baseRevision = doc.value.revision; conflict.value = null; }
function useTheirs() { editing.value = false; conflict.value = null; }
async function remove() {
  if (!doc.value || !window.confirm(`Delete “${doc.value.title}” for everyone in this chat? Its revisions are deleted too.`)) return;
  busy.value = true;
  try { await documents.remove(props.documentId); await navigateTo(props.back, { replace: true }); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}
</script>

<template>
  <PageBar :title="editing ? 'Edit document' : (doc?.title ?? 'Document')" :back="back" always-back>
    <template v-if="doc && !editing">
      <AppIconButton icon="clock" label="Revisions" @click="showHistory = !showHistory" />
      <AppIconButton icon="compose" label="Edit" @click="startEditing" />
    </template>
    <template v-else-if="editing">
      <AppButton variant="text" :disabled="busy" @click="editing = false">Cancel</AppButton>
      <AppButton :disabled="busy || !draft.title.trim() || !changed" @click="save">Save</AppButton>
    </template>
  </PageBar>
  <div class="page">
    <div class="page-inner document-page">
      <AppNotice v-if="error ?? entry.error">{{ error ?? entry.error }}</AppNotice>
      <AppLoading v-if="!doc && !entry.error" />
      <template v-else-if="doc && editing">
        <AppNotice v-if="conflict" tone="warning">
          {{ conflict }}
          <template #actions>
            <button type="button" class="link-button" @click="useTheirs">Use their version</button>
            <button type="button" class="link-button" @click="keepMine">Keep mine and save over it</button>
          </template>
        </AppNotice>
        <input v-model="draft.title" class="document-title-input" type="text" maxlength="200" aria-label="Title">
        <AppSegmented v-model="preview" :options="modes" label="Editor mode" />
        <textarea v-if="!preview" v-model="draft.body" class="document-editor" maxlength="100000" aria-label="Markdown" placeholder="Write in Markdown…" />
        <MessageMarkdown v-else class="document-body" :text="draft.body || '*Nothing to preview.*'" />
        <input v-model="draft.summary" class="document-summary" type="text" maxlength="300" placeholder="What changed? (optional)" aria-label="Change summary">
      </template>
      <template v-else-if="doc">
        <p class="small muted document-meta">Revision {{ doc.revision }} · Updated by {{ doc.updatedByName }} · {{ fullDate(doc.updatedAt) }}</p>
        <details v-if="doc.research" class="group text-block">
          <summary>Web research · {{ doc.research.sources.filter(source => source.cited).length }} cited sources</summary>
          <p class="small muted">Checked {{ fullDate(doc.research.checkedAt) }} · Sources refer to revision {{ doc.research.originalRevision }}.</p>
          <p>{{ doc.research.query }}</p>
          <ul>
            <li v-for="source in doc.research.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
              <span class="small muted"> · {{ source.cited ? 'Cited' : 'Retrieved' }}</span>
            </li>
          </ul>
        </details>
        <AppListGroup v-if="showHistory">
          <div v-for="revision in doc.revisions" :key="revision.revision" class="text-block">
            <strong>{{ revision.revision }}</strong> · {{ revision.authorName }} · {{ fullDate(revision.createdAt) }}<br>
            <span class="small muted">{{ revision.summary ?? 'No summary' }}</span>
          </div>
        </AppListGroup>
        <MessageMarkdown v-if="doc.body.trim()" class="document-body" :text="doc.body" />
        <AppEmptyState v-else icon="doc" text="This document is empty. Edit it, or ask a contact in the chat to write it." />
        <div class="actions-row">
          <AppButton variant="danger-text" size="small" :disabled="busy" @click="remove">Delete document</AppButton>
        </div>
      </template>
      <AppEmptyState v-else icon="error" title="Document unavailable" text="It was deleted or you no longer have access." />
    </div>
  </div>
</template>
