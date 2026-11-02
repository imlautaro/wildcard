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
const { t } = useI18n();
const modes = computed<{ value: boolean; label: string }[]>(() => [{ value: false, label: t('miniapps.documents.write') }, { value: true, label: t('miniapps.documents.preview') }]);

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  documents.load(props.documentId, true);
  // Contacts may be editing; keep the viewer current, but never replace an open draft.
  timer = setInterval(() => { if (!editing.value && document.visibilityState === 'visible') documents.load(props.documentId); }, 5000);
});
onBeforeUnmount(() => clearInterval(timer));
onBeforeRouteLeave(() => !editing.value || !changed.value || window.confirm(t('miniapps.documents.discardConfirm')));
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
      conflict.value = t('miniapps.documents.conflict', { name: failure.current?.updatedByName ?? t('miniapps.documents.someone'), revision: failure.current?.revision ?? '?' });
    } else error.value = errorMessage(failure);
  } finally { busy.value = false; }
}
// Keep my text and save it over the newer revision.
function keepMine() { if (doc.value) draft.baseRevision = doc.value.revision; conflict.value = null; }
function useTheirs() { editing.value = false; conflict.value = null; }
async function remove() {
  if (!doc.value || !window.confirm(t('miniapps.documents.deleteConfirm', { title: doc.value.title }))) return;
  busy.value = true;
  try { await documents.remove(props.documentId); await navigateTo(props.back, { replace: true }); }
  catch (failure) { error.value = errorMessage(failure); }
  finally { busy.value = false; }
}
</script>

<template>
  <PageBar :title="editing ? $t('miniapps.documents.editTitle') : (doc?.title ?? $t('miniapps.documents.fallbackTitle'))" :back="back" always-back>
    <template v-if="doc && !editing">
      <AppIconButton icon="clock" :label="$t('miniapps.documents.revisions')" @click="showHistory = !showHistory" />
      <AppIconButton icon="compose" :label="$t('common.edit')" @click="startEditing" />
    </template>
    <template v-else-if="editing">
      <AppButton variant="text" :disabled="busy" @click="editing = false">{{ $t('common.cancel') }}</AppButton>
      <AppButton :disabled="busy || !draft.title.trim() || !changed" @click="save">{{ $t('common.save') }}</AppButton>
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
            <button type="button" class="link-button" @click="useTheirs">{{ $t('miniapps.documents.useTheirs') }}</button>
            <button type="button" class="link-button" @click="keepMine">{{ $t('miniapps.documents.keepMine') }}</button>
          </template>
        </AppNotice>
        <input v-model="draft.title" class="document-title-input" type="text" maxlength="200" :aria-label="$t('miniapps.documents.titleLabel')">
        <AppSegmented v-model="preview" :options="modes" :label="$t('miniapps.documents.editorMode')" />
        <textarea v-if="!preview" v-model="draft.body" class="document-editor" maxlength="100000" :aria-label="$t('miniapps.documents.markdownLabel')" :placeholder="$t('miniapps.documents.placeholder')" />
        <MessageMarkdown v-else class="document-body" :text="draft.body || $t('miniapps.documents.nothingToPreview')" />
        <input v-model="draft.summary" class="document-summary" type="text" maxlength="300" :placeholder="$t('miniapps.documents.summaryPlaceholder')" :aria-label="$t('miniapps.documents.summaryLabel')">
      </template>
      <template v-else-if="doc">
        <p class="small muted document-meta">{{ $t('miniapps.documents.meta', { revision: doc.revision, name: doc.updatedByName, date: fullDate(doc.updatedAt) }) }}</p>
        <details v-if="doc.research" class="group text-block">
          <summary>{{ $t('miniapps.documents.research', doc.research.sources.filter(source => source.cited).length) }}</summary>
          <p class="small muted">{{ $t('miniapps.documents.checked', { date: fullDate(doc.research.checkedAt), revision: doc.research.originalRevision }) }}</p>
          <p>{{ doc.research.query }}</p>
          <ul>
            <li v-for="source in doc.research.sources" :key="source.url">
              <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }}</a>
              <span class="small muted"> · {{ source.cited ? $t('miniapps.documents.cited') : $t('miniapps.documents.retrieved') }}</span>
            </li>
          </ul>
        </details>
        <AppListGroup v-if="showHistory">
          <div v-for="revision in doc.revisions" :key="revision.revision" class="text-block">
            <strong>{{ revision.revision }}</strong> · {{ revision.authorName }} · {{ fullDate(revision.createdAt) }}<br>
            <span class="small muted">{{ revision.summary ?? $t('miniapps.documents.noSummary') }}</span>
          </div>
        </AppListGroup>
        <MessageMarkdown v-if="doc.body.trim()" class="document-body" :text="doc.body" />
        <AppEmptyState v-else icon="doc" :text="$t('miniapps.documents.empty')" />
        <div class="actions-row">
          <AppButton variant="danger-text" size="small" :disabled="busy" @click="remove">{{ $t('miniapps.documents.delete') }}</AppButton>
        </div>
      </template>
      <AppEmptyState v-else icon="error" :title="$t('miniapps.documents.unavailableTitle')" :text="$t('miniapps.documents.unavailableText')" />
    </div>
  </div>
</template>
