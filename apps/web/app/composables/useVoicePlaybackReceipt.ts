// Playback metadata belongs to the existing session conversation caches.
const playbackWrites = new Map<string, Promise<void>>();
registerSessionReset(() => playbackWrites.clear());
export async function markVoicePlayback(path: string) {
  const owner = useSession().user.value?.id;
  if (!owner) return;
  const url = new URL(path, 'https://voice.invalid/');
  const privateMatch = /^contacts\/([^/]+)\/chat\/turns\/([^/]+)\/attachment$/.exec(url.pathname.slice(1));
  const groupMatch = /^groups\/([^/]+)\/messages\/([^/]+)\/attachment$/.exec(url.pathname.slice(1));
  const part = Number(url.searchParams.get('part') ?? 0);
  const conversation = privateMatch ? peekConversation(privateMatch[1]!) : null;
  const group = groupMatch ? peekGroupConversation(groupMatch[1]!) : null;
  const voice = privateMatch && url.searchParams.get('side') === 'assistant'
    ? conversation?.turns.find((turn) => turn.id === privateMatch[2])?.assistantMessages?.[part]?.voice
    : group?.messages.find((message) => message.id === groupMatch?.[2])?.voice;
  if (!voice) return;
  voice.ownListenedAt ??= Date.now();
  const key = `${owner}/${path}`;
  if (playbackWrites.has(key)) return playbackWrites.get(key);
  url.pathname += '/listened';
  const request = api<{ listenedAt: number }>(url.pathname.slice(1) + url.search, { method: 'PUT' }).then((receipt) => {
    if (owner !== useSession().user.value?.id) return;
    if (privateMatch && peekConversation(privateMatch[1]!) !== conversation) return;
    if (groupMatch && peekGroupConversation(groupMatch[1]!) !== group) return;
    voice.ownListenedAt = receipt.listenedAt;
  }).catch(() => { /* Keep local listening evidence; retry on the next playback. */ });
  playbackWrites.set(key, request);
  try { await request; } finally { if (playbackWrites.get(key) === request) playbackWrites.delete(key); }
}
