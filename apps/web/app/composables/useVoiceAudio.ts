// Voice message audio (docs/voice.md#web). Bytes live only in memory, like private
// images: object URLs keyed by account and download path (turn/message IDs are
// immutable), at most 32 MiB per session with least recently used eviction, and
// dropped on sign-out and account changes. One shared <audio> element plays at a time.
type Entry = { url: string | null; size: number; promise: Promise<string>; blob?: Blob; samples?: number[]; waveform?: Promise<number[]> };
const entries = new Map<string, Entry>();
const budget = 32 * 1024 * 1024;
let total = 0;

// Reactive playback state for the bubbles. `key` identifies the bubble that owns the player.
export const voicePlayer = reactive({ key: null as string | null, playing: false, loading: false, position: 0, duration: 0, failed: null as string | null });
let audio: HTMLAudioElement | null = null;
let currentURL: string | null = null;
let request = 0;
let playbackFrame: number | undefined;

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
  entry.blob = blob;
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

/** Derived data shares each audio entry's identity, eviction and session lifetime. */
export function cachedVoiceWaveform(path: string): number[] | undefined {
  return entries.get(cacheKey(path))?.samples;
}

// Serialize decoding to bound transient PCM memory when many bubbles enter the viewport.
let decoding: Promise<unknown> = Promise.resolve();
export async function voiceWaveform(path: string): Promise<number[]> {
  const key = cacheKey(path);
  await voiceAudioURL(path);
  const entry = entries.get(key);
  if (!entry?.blob) throw new Error('Audio was discarded.');
  if (entry.samples) return entry.samples;
  if (entry.waveform) return entry.waveform;
  const operation = decoding.catch(() => {}).then(async () => {
    if (entries.get(key) !== entry) throw new Error('Audio was discarded.');
    if (entry.blob!.size > 8 * 1024 * 1024) throw new Error('Audio is too large.');
    const context = new OfflineAudioContext(1, 1, 16000);
    const buffer = await context.decodeAudioData(await entry.blob!.arrayBuffer());
    if (entries.get(key) !== entry) throw new Error('Audio was discarded.');
    if (buffer.duration > 600 || buffer.numberOfChannels > 8) throw new Error('Audio is too long.');
    const count = 37;
    const energy = Array<number>(count).fill(0);
    const samples = Array<number>(count).fill(0);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const pcm = buffer.getChannelData(channel);
      for (let frame = 0; frame < pcm.length; frame++) {
        const bin = Math.min(count - 1, Math.floor(frame * count / pcm.length));
        const value = pcm[frame]!;
        if (Number.isFinite(value)) { energy[bin]! += value * value; samples[bin]!++; }
      }
    }
    const rms = energy.map((value, index) => Math.sqrt(value / Math.max(1, samples[index]!)));
    const peak = Math.max(...rms);
    const values = rms.map((value) => peak > 0 ? (value / peak) ** 0.65 : 0);
    entry.samples = values;
    entry.size += count * 8;
    total += count * 8;
    evict();
    return values;
  });
  entry.waveform = operation;
  decoding = operation;
  try { return await operation; }
  catch (failure) { if (entry.waveform === operation) entry.waveform = undefined; throw failure; }
}

function stopPlaybackFrame() {
  if (playbackFrame !== undefined) cancelAnimationFrame(playbackFrame);
  playbackFrame = undefined;
}

function updatePlaybackFrame() {
  if (!audio || audio.paused) { playbackFrame = undefined; return; }
  voicePlayer.position = audio.currentTime;
  playbackFrame = requestAnimationFrame(updatePlaybackFrame);
}

function element() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('timeupdate', () => { voicePlayer.position = audio!.currentTime; });
  audio.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(audio!.duration)) return;
    voicePlayer.duration = audio!.duration;
    const position = Math.min(audio!.duration, Math.max(0, voicePlayer.position));
    audio!.currentTime = position;
    voicePlayer.position = position;
  });
  audio.addEventListener('play', () => { voicePlayer.playing = true; stopPlaybackFrame(); updatePlaybackFrame(); });
  audio.addEventListener('pause', () => { voicePlayer.playing = false; stopPlaybackFrame(); });
  audio.addEventListener('ended', () => { voicePlayer.playing = false; voicePlayer.position = 0; stopPlaybackFrame(); });
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
export async function toggleVoice(key: string, source: () => Promise<string>, startAt = 0) {
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
    player.currentTime = Math.max(0, startAt);
    voicePlayer.position = Math.max(0, startAt);
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
  const position = Math.min(voicePlayer.duration || Infinity, Math.max(0, seconds));
  if (!Number.isFinite(position)) return;
  audio.currentTime = position;
  voicePlayer.position = position;
}

/** Stops playback; called when leaving a chat, group or contact page. */
export function stopVoicePlayback() {
  stopPlaybackFrame();
  request += 1;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  currentURL = null;
  voicePlayer.key = null; voicePlayer.playing = false; voicePlayer.loading = false; voicePlayer.position = 0; voicePlayer.duration = 0;
}
