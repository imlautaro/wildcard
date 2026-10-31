export type GroupMessageInfo = { tracked: boolean; recipients: {
  kind: 'user' | 'agent'; id: string; name: string; deliveredAt: number | null; readAt: number | null;
}[] };
type Entry = { value: GroupMessageInfo | null; request: Promise<void> | null; error: string | null; unavailable: boolean };
const entries = shallowReactive(new Map<string, Entry>());
registerSessionReset(() => {
  for (const entry of entries.values()) { entry.value = null; entry.unavailable = true; }
  entries.clear();
});
// Recipient names follow contact aliases, so an alias change drops every snapshot.
export function forgetAllGroupMessageInfo() {
  for (const entry of entries.values()) { entry.value = null; entry.unavailable = true; }
  entries.clear();
}
export function forgetGroupMessageInfo(groupID: string) {
  for (const [key, entry] of entries) if (key.startsWith(`${groupID}/`)) {
    entry.value = null; entry.unavailable = true; entries.delete(key);
  }
}
export function useGroupMessageInfo(groupID: string, messageID: string) {
  const key = `${groupID}/${messageID}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = reactive({ value: null, request: null, error: null, unavailable: false });
    entries.set(key, entry);
  } else { entries.delete(key); entries.set(key, entry); }
  for (const [oldKey, old] of entries) {
    if (entries.size <= 32) break;
    if (oldKey !== key && !old.request) { old.value = null; old.unavailable = true; entries.delete(oldKey); }
  }
  const current = entry;
  async function refresh() {
    if (current.request) return current.request;
    if (current.unavailable || entries.get(key) !== current) return;
    current.request = (async () => {
      try {
        const value = await api<GroupMessageInfo>(`groups/${groupID}/message-info`, { query: { messageID } });
        if (entries.get(key) !== current) return;
        current.value = value; current.error = null;
      } catch (error) {
        if (entries.get(key) !== current) return;
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
          current.value = null; current.unavailable = true;
        }
        current.error = errorMessage(error);
      } finally { current.request = null; }
    })();
    return current.request;
  }
  return { entry: current, refresh };
}
