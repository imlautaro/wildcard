type ExportManifest = {
  schemaVersion: number;
  accountId: string;
  datasets: string[];
  scopes: { kind: string; id: string; revision: number; clearing: number }[];
};
type ExportPage = { accountId: string; rows: Record<string, unknown>[]; nextCursor: string | null };

// Explicit downloads are intentionally not cached: each run reads current data,
// retains only bounded JSON parts, and drops them on cancellation/session reset.
const exporting = ref(false);
const progress = ref('');
const exportError = ref<string | null>(null);
let active: AbortController | null = null;

function cancel() {
  active?.abort();
  active = null;
  exporting.value = false;
  progress.value = '';
}
registerSessionReset(() => { cancel(); exportError.value = null; });

async function download() {
  if (active) return;
  const owner = useSession().user.value?.id;
  if (!owner) return;
  const controller = new AbortController();
  active = controller;
  exporting.value = true;
  exportError.value = null;
  const startedAt = new Date().toISOString();
  const parts: BlobPart[] = [];
  let bytes = 0;
  const counts: Record<string, number> = {};
  function checkSession(accountId: string) {
    if (controller.signal.aborted || active !== controller || useSession().user.value?.id !== owner || accountId !== owner) {
      throw new DOMException('Export canceled', 'AbortError');
    }
  }
  function append(value: string) {
    const part = new TextEncoder().encode(value);
    bytes += part.byteLength;
    if (bytes > 100 * 1024 * 1024) throw new Error(translate('errors.debugExport.tooLarge'));
    parts.push(part);
  }
  try {
    const manifest = await api<ExportManifest>('me/debug-export', { signal: controller.signal });
    checkSession(manifest.accountId);
    append(JSON.stringify({
      format: 'wildcard-debug-export', schemaVersion: manifest.schemaVersion, accountId: owner, startedAt,
      scope: 'Current account private chats and groups with current membership, including archived history.',
      timestamps: 'Database *_at fields are Unix milliseconds; sequence fields order messages within their table.',
      consistency: 'Live export, not an atomic snapshot. Records may change while downloading.',
      privacy: 'Contains private text and group participants. Review before sharing with an AI or anyone else.',
      excluded: ['Authentication and connector credentials', 'Other accounts private chats', 'Global agent memory and private relationship direction', 'Media file bytes', 'Deleted data', 'Infrastructure logs and raw model requests'],
      jsonFields: 'Fields ending in _json retain their stored JSON strings for debugging.',
      scopes: manifest.scopes,
    }).slice(0, -1) + ',"data":{');
    for (const [index, dataset] of manifest.datasets.entries()) {
      counts[dataset] = 0;
      append(`${index ? ',' : ''}${JSON.stringify(dataset)}:[`);
      let cursor: string | undefined;
      do {
        // Dataset names are API identifiers, shown as-is in every language.
        const records = Object.values(counts).reduce((a, b) => a + b, 0);
        progress.value = translate('account.debugExport.progress', { dataset: dataset.replaceAll('_', ' '), count: records }, records);
        const page = await api<ExportPage>('me/debug-export', { query: { dataset, cursor }, signal: controller.signal });
        checkSession(page.accountId);
        for (const row of page.rows) {
          append(`${counts[dataset] ? ',' : ''}${JSON.stringify(row)}`);
          counts[dataset]! += 1;
        }
        if (page.nextCursor !== null && Number(page.nextCursor) <= Number(cursor ?? 0)) throw new Error(translate('errors.debugExport.paginationStalled'));
        cursor = page.nextCursor ?? undefined;
      } while (cursor !== undefined);
      append(']');
    }
    // Do not save previously buffered history after access loss, deletion or clear.
    const final = await api<ExportManifest>('me/debug-export', { signal: controller.signal });
    checkSession(final.accountId);
    if (JSON.stringify(final.scopes) !== JSON.stringify(manifest.scopes)) {
      throw new Error(translate('errors.debugExport.changed'));
    }
    append(`},"counts":${JSON.stringify(counts)},"completedAt":${JSON.stringify(new Date().toISOString())}}`);
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `wildcard-debug-${startedAt.replaceAll(':', '-')}.json`;
    document.body.append(link);
    try { link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    progress.value = translate('account.debugExport.ready');
  } catch (failure) {
    if (active === controller && !controller.signal.aborted) exportError.value = errorMessage(failure);
  } finally {
    parts.length = 0;
    if (active === controller) { active = null; exporting.value = false; }
  }
}

export function useDebugExport() {
  return { exporting: readonly(exporting), progress: readonly(progress), exportError: readonly(exportError), download, cancel };
}
