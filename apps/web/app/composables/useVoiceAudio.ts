// Voice message audio (docs/voice.md#web). Bytes live only in memory, like private
// images: object URLs keyed by account and download path (turn/message IDs are
// immutable), at most 32 MiB per session with least recently used eviction, and
// dropped on sign-out and account changes. One shared <audio> element plays at a time.
type Entry = { url: string | null; size: number; promise: Promise<string>; blob?: Blob; samples?: number[]; waveform?: Promise<number[]> };
const entries = new Map<string, Entry>();
const budget = 32 * 1024 * 1024;
let total = 0;

// Reactive playback state for the bubbles. `key` identifies the bubble that owns the player.
export const voicePlayer = reactive({ key: null as string | null, playing: false, loading: false, position: 0, duration: 0, rate: 1, failed: null as string | null });
let audio: HTMLAudioElement | null = null;
let currentURL: string | null = null;
let request = 0;
let playbackFrame: number | undefined;
let rateOwner: string | null = null;
let messagePlayback = false;
let captureActive = false;
let mediaArtwork: MediaImage[] = [];
let releaseArtwork: (() => void) | null = null;
let placeholderArtwork: string | null = null;

function fallbackMediaArtwork(): MediaImage[] {
  if (!placeholderArtwork) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 288;
    const context = canvas.getContext('2d');
    if (!context) return [];
    context.fillStyle = '#e5e7eb'; context.fillRect(0, 0, 288, 288);
    context.fillStyle = '#8e8e93';
    context.beginPath(); context.arc(144, 101, 43, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(144, 233, 86, 69, 0, Math.PI, 0); context.fill();
    placeholderArtwork = canvas.toDataURL('image/png');
  }
  return [{ src: placeholderArtwork, sizes: '288x288', type: 'image/png' }];
}

function updateMediaMetadata() {
  if (!import.meta.client || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  navigator.mediaSession.metadata = messagePlayback
    ? new MediaMetadata({ title: 'Voice message', artwork: mediaArtwork }) : null;
}

function loadSenderArtwork(path: string | null | undefined, started: number) {
  if (!path || !('mediaSession' in navigator)) return;
  const retained = retainPrivateImage(path);
  releaseArtwork = retained.release;
  void retained.url.then((url) => {
    if (!url || request !== started || !messagePlayback) return;
    mediaArtwork = [{ src: url }];
    updateMediaMetadata();
  });
}

/** Recording owns the audio path until capture is released. */
export function setVoiceCaptureActive(active: boolean) {
  captureActive = active;
  if (active) stopVoicePlayback();
}

function updateMediaPosition() {
  if (!import.meta.client || !('mediaSession' in navigator) || !messagePlayback || !audio) return;
  navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
  try {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate,
        position: Math.min(audio.duration, Math.max(0, audio.currentTime)) });
    }
  } catch { /* Position reporting is optional in older browsers. */ }
}

function configureMediaSession(active: boolean) {
  if (!import.meta.client || !('mediaSession' in navigator)) return;
  const session = navigator.mediaSession;
  // Publish the requested sender photo; keep names and transcripts off system surfaces.
  updateMediaMetadata();
  session.playbackState = active ? 'paused' : 'none';
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => { if (messagePlayback && !captureActive) void audio?.play().catch(() => {}); }],
    ['pause', () => audio?.pause()],
    ['stop', stopVoicePlayback],
    ['seekto', (event) => { if (voicePlayer.key && event.seekTime !== undefined) seekVoice(voicePlayer.key, event.seekTime); }],
    ['seekbackward', (event) => { if (voicePlayer.key) seekVoice(voicePlayer.key, (audio?.currentTime ?? 0) - (event.seekOffset ?? 10)); }],
    ['seekforward', (event) => { if (voicePlayer.key) seekVoice(voicePlayer.key, (audio?.currentTime ?? 0) + (event.seekOffset ?? 10)); }],
  ];
  for (const [action, handler] of actions) {
    try { session.setActionHandler(action, active ? handler : null); }
    catch { /* Each browser supports a different subset of media commands. */ }
  }
  try { session.setPositionState(); } catch { /* Optional API. */ }
  if (active) updateMediaPosition();
}

function playbackRateKey(owner: string) { return `voicePlaybackRate.v1.${owner}`; }

function restorePlaybackRate() {
  const owner = useSession().user.value?.id ?? null;
  if (owner === rateOwner) return;
  rateOwner = owner;
  let saved = 1;
  if (owner && import.meta.client) {
    try { saved = Number(localStorage.getItem(playbackRateKey(owner))); }
    catch { /* Storage can be disabled; the in-memory preference still works. */ }
  }
  voicePlayer.rate = [1, 1.5, 2].includes(saved) ? saved : 1;
}

/** Change the active audio in place and retain the selection for the next clip. */
export function cycleVoicePlaybackRate() {
  restorePlaybackRate();
  if (!rateOwner) return;
  voicePlayer.rate = voicePlayer.rate === 1 ? 1.5 : voicePlayer.rate === 1.5 ? 2 : 1;
  if (audio) audio.playbackRate = voicePlayer.rate;
  updateMediaPosition();
  try { localStorage.setItem(playbackRateKey(rateOwner), String(voicePlayer.rate)); }
  catch { /* Keep playback usable when browser storage is unavailable. */ }
}

export function clearVoiceAudio() {
  stopVoicePlayback();
  rateOwner = null;
  captureActive = false;
  voicePlayer.rate = 1;
  voicePlayer.failed = null;
  for (const entry of entries.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  entries.clear();
  total = 0;
}
registerSessionReset(clearVoiceAudio);

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
  audio.preservesPitch = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !messagePlayback) stopVoicePlayback();
  });
  audio.addEventListener('timeupdate', () => { voicePlayer.position = audio!.currentTime; updateMediaPosition(); });
  audio.addEventListener('loadedmetadata', () => {
    audio!.playbackRate = voicePlayer.rate;
    if (!Number.isFinite(audio!.duration)) return;
    voicePlayer.duration = audio!.duration;
    const position = Math.min(audio!.duration, Math.max(0, voicePlayer.position));
    audio!.currentTime = position;
    voicePlayer.position = position;
    updateMediaPosition();
  });
  audio.addEventListener('playing', () => { voicePlayer.playing = true; stopPlaybackFrame(); updatePlaybackFrame(); updateMediaPosition(); });
  audio.addEventListener('pause', () => { voicePlayer.playing = false; stopPlaybackFrame(); updateMediaPosition(); });
  audio.addEventListener('ended', stopVoicePlayback);
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
export async function toggleVoice(key: string, source: () => Promise<string>, startAt = 0, isMessage = false, senderPhoto?: string | null) {
  if (captureActive) return;
  restorePlaybackRate();
  const player = element();
  player.playbackRate = voicePlayer.rate;
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
    player.playbackRate = voicePlayer.rate;
    player.currentTime = Math.max(0, startAt);
    voicePlayer.position = Math.max(0, startAt);
    voicePlayer.loading = false;
    messagePlayback = isMessage;
    mediaArtwork = isMessage ? fallbackMediaArtwork() : [];
    configureMediaSession(isMessage);
    if (isMessage) loadSenderArtwork(senderPhoto, started);
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
  updateMediaPosition();
}

/** Stops playback on replacement, recording, completion, invalidation or session reset. */
export function stopVoicePlayback() {
  releaseArtwork?.(); releaseArtwork = null;
  mediaArtwork = [];
  stopPlaybackFrame();
  request += 1;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  currentURL = null;
  messagePlayback = false;
  configureMediaSession(false);
  voicePlayer.key = null; voicePlayer.playing = false; voicePlayer.loading = false; voicePlayer.position = 0; voicePlayer.duration = 0;
}
