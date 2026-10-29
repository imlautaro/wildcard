// Voice message audio (docs/voice.md#web). Bytes live only in memory, like private
// images: object URLs keyed by account and download path (turn/message IDs are
// immutable), at most 32 MiB per session with least recently used eviction, and
// dropped on sign-out and account changes. One shared <audio> element plays at a time.
type Entry = { url: string | null; size: number; promise: Promise<string> };
const entries = new Map<string, Entry>();
const budget = 32 * 1024 * 1024;
let total = 0;

// Reactive playback state for the bubbles. `key` identifies the bubble that owns the player.
export const voicePlayer = reactive({ key: null as string | null, playing: false, loading: false, position: 0, duration: 0, failed: null as string | null });
let audio: HTMLAudioElement | null = null;
let currentURL: string | null = null;
let request = 0;

registerSessionReset(() => {
  stopVoicePlayback();
  voicePlayer.failed = null;
  for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  entries.clear();
  total = 0;
});

function cacheKey(path: string) {
  return `${useSession().user.value?.id ?? ''}|${path}`;
}

function evict() {
  for (const [key, entry] of entries) {
    if (total <= budget) break;
    // The clip that is playing stays until it is replaced.
    if (!entry.url || entry.url === currentURL) continue;
    URL.revokeObjectURL(entry.url);
    total -= entry.size;
    entries.delete(key);
  }
}

function store(key: string, entry: Entry, blob: Blob) {
  const url = URL.createObjectURL(blob);
  entry.url = url;
  entry.size = blob.size;
  total += blob.size;
  // The new entry becomes the most recent, so eviction never revokes the URL it returns.
  entries.delete(key);
  entries.set(key, entry);
  evict();
  return url;
}

/** Object URL for a voice download path; concurrent requests share one download. */
export function voiceAudioURL(path: string): Promise<string> {
  const key = cacheKey(path);
  const existing = entries.get(key);
  if (existing) {
    entries.delete(key);
    entries.set(key, existing);
    return existing.promise;
  }
  const entry: Entry = { url: null, size: 0, promise: Promise.resolve('') };
  entry.promise = apiBlob(path).then((blob) => {
    if (entries.get(key) !== entry) throw new Error('Audio was discarded.');
    return store(key, entry, blob);
  }, (failure) => {
    // Failed downloads are retried on the next request rather than cached.
    if (entries.get(key) === entry) entries.delete(key);
    throw failure;
  });
  entries.set(key, entry);
  return entry.promise;
}

/** Seeds the cache with an accepted outgoing clip so its bubble plays without a download. */
export function seedVoiceAudio(path: string, blob: Blob) {
  const key = cacheKey(path);
  if (entries.has(key)) return;
  const entry: Entry = { url: null, size: 0, promise: Promise.resolve('') };
  entries.set(key, entry);
  entry.promise = Promise.resolve(store(key, entry, blob));
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('timeupdate', () => { voicePlayer.position = audio!.currentTime; });
  audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio!.duration)) voicePlayer.duration = audio!.duration; });
  audio.addEventListener('play', () => { voicePlayer.playing = true; });
  audio.addEventListener('pause', () => { voicePlayer.playing = false; });
  audio.addEventListener('ended', () => { voicePlayer.playing = false; voicePlayer.position = 0; });
  audio.addEventListener('error', () => {
    if (!voicePlayer.key || !currentURL) return;
    voicePlayer.failed = voicePlayer.key;
    stopVoicePlayback();
  });
  return audio;
}

/**
 * Plays or pauses the bubble `key`. `source` resolves its object URL (from the cache,
 * or a local clip for a pending send). Starting another bubble pauses the current one.
 */
export async function toggleVoice(key: string, source: () => Promise<string>) {
  const player = element();
  if (voicePlayer.key === key && currentURL) {
    if (player.paused) await player.play().catch(() => {});
    else player.pause();
    return;
  }
  stopVoicePlayback();
  const started = ++request;
  voicePlayer.key = key; voicePlayer.loading = true; voicePlayer.failed = null;
  try {
    const url = await source();
    if (started !== request) return;
    currentURL = url;
    player.src = url;
    voicePlayer.loading = false;
    await player.play();
  } catch {
    if (started !== request) return;
    voicePlayer.failed = key;
    stopVoicePlayback();
  }
}

export function seekVoice(key: string, seconds: number) {
  if (voicePlayer.key !== key || !audio || !currentURL) return;
  audio.currentTime = seconds;
  voicePlayer.position = seconds;
}

/** Stops playback; called when leaving a chat, group or contact page. */
export function stopVoicePlayback() {
  request += 1;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  currentURL = null;
  voicePlayer.key = null; voicePlayer.playing = false; voicePlayer.loading = false; voicePlayer.position = 0; voicePlayer.duration = 0;
}
