// One chat's readable JSON transcript (docs/chat-export.md). Explicit downloads
// are intentionally not cached: each run reads current history, keeps nothing
// after saving, and is discarded on cancellation or session reset.
const exportingKey = ref<string | null>(null);
const exportError = ref<{ key: string; message: string } | null>(null);
let active: AbortController | null = null;

function cancel() {
  active?.abort();
  active = null;
  exportingKey.value = null;
}
registerSessionReset(() => { cancel(); exportError.value = null; });

const fileName = (name: string, at: string) =>
  `wildcard-chat-${name.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'export'}-${at.slice(0, 10)}.json`;

async function download(kind: 'contact' | 'group', id: string) {
  if (active) return;
  const owner = useSession().user.value?.id;
  if (!owner) return;
  const key = `${kind}:${id}`;
  const controller = new AbortController();
  active = controller;
  exportingKey.value = key;
  exportError.value = null;
  try {
    const data = await api<{ chat: { name: string }; exportedAt: string }>(
      kind === 'contact' ? `contacts/${id}/chat/export` : `groups/${id}/export`, { signal: controller.signal });
    // Discard a late response after cancel, sign-out or an account switch.
    if (controller.signal.aborted || active !== controller || useSession().user.value?.id !== owner) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(data.chat.name, data.exportedAt);
    document.body.append(link);
    try { link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  } catch (failure) {
    if (active === controller && !controller.signal.aborted) exportError.value = { key, message: errorMessage(failure) };
  } finally {
    if (active === controller) { active = null; exportingKey.value = null; }
  }
}

export function useChatExport() {
  return { exportingKey: readonly(exportingKey), exportError: readonly(exportError), download, cancel };
}
