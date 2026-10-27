export const reactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export type MessageReaction = { messageID: string; side: string; actorID: string; name: string; emoji: string };
export function createReactionCache() {
  return reactive({ rows: [] as MessageReaction[], busy: [] as string[], pending: {} as Record<string, { messageID: string; side: string; emoji: string | null }>,
    errors: {} as Record<string, string>, revision: 0, refreshing: false, invalidated: false });
}
export type ReactionCache = ReturnType<typeof createReactionCache>;
export function clearReactionCache(cache: ReactionCache) {
  cache.invalidated = true;
  cache.revision++;
  cache.rows = [];
  cache.pending = {};
  cache.errors = {};
}
export async function refreshReactions(cache: ReactionCache, path: string, ids: string[]) {
  if (cache.invalidated || cache.refreshing) return;
  cache.refreshing = true;
  const revision = cache.revision;
  try {
    const rows: MessageReaction[] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await api<{ reactions: MessageReaction[] }>(path, { query: { messageIDs: JSON.stringify(ids.slice(offset, offset + 100)) } });
      rows.push(...result.reactions);
    }
    if (!cache.invalidated && cache.revision === revision) cache.rows = rows;
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) clearReactionCache(cache);
    // Keep the last successful snapshot during transient failures.
  } finally { cache.refreshing = false; }
}
export async function setMessageReaction(cache: ReactionCache, path: string, messageID: string, side: string, emoji: string | null) {
  const key = `${messageID}/${side}`;
  if (cache.invalidated || cache.busy.includes(key)) return;
  const { user } = useSession();
  const actorID = `user/${user.value?.id}`;
  const account = user.value?.id;
  cache.busy.push(key);
  cache.pending[key] = { messageID, side, emoji };
  cache.revision++;
  delete cache.errors[key];
  try {
    await api(path, { method: 'PUT', json: { messageID, side, emoji } });
    if (cache.invalidated || account !== user.value?.id) return;
    cache.rows = cache.rows.filter((row) => !(row.messageID === messageID && row.side === side && row.actorID === actorID));
    if (emoji !== null) cache.rows.push({ messageID, side, actorID, name: user.value?.name ?? 'You', emoji });
    delete cache.pending[key];
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) clearReactionCache(cache);
    else if (!cache.invalidated && account === user.value?.id) cache.errors[key] = errorMessage(error);
  } finally {
    cache.revision++;
    cache.busy = cache.busy.filter((value) => value !== key);
  }
}
