// Foreground pop/chime events share one gesture-unlocked Web Audio context.
// Bundled WAVs retain the iOS -40 dB attenuation; web applies +28 dB at playback.
// Conversation keys: `contact/<id>` or `group/<id>`. No background/push audio.
const files = { pop: '/sounds/mixkit-hard-pop-click-2364.wav', chime: '/sounds/mixkit-alert-quick-chime-766.wav' } as const;
type Sound = keyof typeof files;
const webGain = 10 ** (28 / 20);
let visibleConversation: string | null = null;
let activeSince: number | null = null;
let generation = 0;
const played = new Set<string>();
let context: AudioContext | null = null;
let output: GainNode | null = null;
const buffers = new Map<Sound, Promise<AudioBuffer>>();
const sources = new Map<Sound, AudioBufferSourceNode>();

function stopSounds() {
  for (const source of sources.values()) {
    try { source.stop(); } catch { /* The audio context may already be interrupted. */ }
    source.disconnect();
  }
  sources.clear();
}
registerSessionReset(() => { generation += 1; visibleConversation = null; played.clear(); stopSounds(); });

function loadSound(name: Sound, target: AudioContext): Promise<AudioBuffer> {
  const existing = buffers.get(name);
  if (existing) return existing;
  const request = fetch(files[name], { signal: AbortSignal.timeout(5000) })
    .then(response => {
      if (!response.ok) throw new Error('SOUND_UNAVAILABLE');
      return response.arrayBuffer();
    })
    .then(bytes => target.decodeAudioData(bytes))
    .catch(error => { if (buffers.get(name) === request) buffers.delete(name); throw error; });
  buffers.set(name, request);
  return request;
}

// Called synchronously in the trusted pointer/key handler, before fetching or
// decoding. A delayed polling callback cannot itself grant autoplay permission.
function unlock() {
  if (!import.meta.client || document.visibilityState !== 'visible' || typeof AudioContext === 'undefined') return;
  try {
    if (!context || context.state === 'closed') {
      context = new AudioContext();
      output = context.createGain();
      output.gain.value = webGain;
      output.connect(context.destination);
      buffers.clear();
    }
    if (context.state !== 'running') void context.resume().catch(() => {});
    for (const name of Object.keys(files) as Sound[]) void loadSound(name, context).catch(() => {});
  } catch { /* A later trusted gesture can retry audio initialization. */ }
}

/** Root-app lifetime: covers sign-in, chats, sheets and keyboard-only navigation. */
export function useMessageSoundPlayback() {
  function gesture(event: Event) { if (event.isTrusted) unlock(); }
  function visibility() {
    activeSince = document.visibilityState === 'visible' ? (activeSince ?? Date.now()) : null;
    if (activeSince === null) { generation += 1; stopSounds(); }
  }
  onMounted(() => {
    visibility();
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('pointerup', gesture, { capture: true, passive: true });
    document.addEventListener('keydown', gesture, { capture: true });
  });
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('pointerup', gesture, true);
    document.removeEventListener('keydown', gesture, true);
    generation += 1; activeSince = null; stopSounds();
    const previous = context;
    context = null; output = null; buffers.clear();
    if (previous && previous.state !== 'closed') void previous.close().catch(() => {});
  });
}

async function play(name: Sound, started: number, still: () => boolean) {
  const target = context, destination = output, requestedAt = Date.now();
  if (!target || target.state !== 'running' || !destination || activeSince === null) return;
  try {
    const buffer = await loadSound(name, target);
    // Do not replay a delayed event after leaving, hiding, signing out or a slow load.
    if (started !== generation || target !== context || target.state !== 'running'
      || activeSince === null || !still() || Date.now() - requestedAt > 1500) return;
    sources.get(name)?.stop();
    const source = target.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.onended = () => { source.disconnect(); if (sources.get(name) === source) sources.delete(name); };
    source.start();
    sources.set(name, source);
  } catch { /* Missing/blocked audio must not disrupt messaging; loads can retry. */ }
}
// Sounds wait briefly, as on iOS, so a reply's bubble has rendered before its pop.
// `keys` are every name the same message can be announced under (turn ID, or the
// chats list's conversation/time key), so it never sounds twice.
function later(delay: number, keys: string[], name: keyof typeof files, still: () => boolean) {
  const started = generation;
  setTimeout(() => {
    if (started !== generation || !still() || keys.some((key) => played.has(key))) return;
    for (const key of keys) played.add(key);
    while (played.size > 500) played.delete(played.values().next().value!);
    void play(name, started, still);
  }, delay);
}

// Shared by list synchronization so the open history takes priority over previews.
export function visibleConversationKey() { return visibleConversation; }

/** Marks a conversation as on screen while the calling page is mounted. */
export function useVisibleConversation(key: MaybeRefOrGetter<string>) {
  const set = () => { visibleConversation = toValue(key); };
  onMounted(set);
  watch(() => toValue(key), set);
  onBeforeUnmount(() => { if (visibleConversation === toValue(key)) visibleConversation = null; });
}

/** An outgoing message the server accepted, in the visible conversation. */
export function messageSent(conversation: string, messageID: string) {
  if (visibleConversation === conversation) later(100, [`sent/${messageID}`], 'pop', () => visibleConversation === conversation);
}

/** A newly completed reply observed by the visible conversation's polling. */
export function replyShown(conversation: string, messageID: string, completedAt: number) {
  if (visibleConversation !== conversation || activeSince === null || completedAt < activeSince) return;
  later(250, [`received/${messageID}`, `received/${conversation}/${completedAt}`], 'pop', () => visibleConversation === conversation);
}

/** A new incoming message in a conversation that is not on screen, seen by the chats list. */
export function messageElsewhere(conversation: string, messageID: string, completedAt: number) {
  if (visibleConversation === conversation || activeSince === null || completedAt < activeSince) return;
  later(100, [`received/${messageID}`, `received/${conversation}/${completedAt}`], 'chime', () => visibleConversation !== conversation);
}
