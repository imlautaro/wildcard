// Foreground message sounds, matching iOS `MessageSounds`: the same attenuated Mixkit
// files, a pop for an accepted send and for a new reply in the visible conversation,
// and a chime for a new message elsewhere while the tab is visible. The web has no
// push, so there is no background notification sound.
// Conversation keys: `contact/<id>` or `group/<id>`.
const files = { pop: '/sounds/mixkit-hard-pop-click-2364.wav', chime: '/sounds/mixkit-alert-quick-chime-766.wav' } as const;
let visibleConversation: string | null = null;
// Only messages completed while the tab has been visible can play, as on iOS.
let activeSince: number | null = null;
let generation = 0;
const played = new Set<string>();
const audio = new Map<keyof typeof files, HTMLAudioElement>();

registerSessionReset(() => { generation += 1; visibleConversation = null; played.clear(); });
if (import.meta.client) {
  const update = () => { activeSince = document.visibilityState === 'visible' ? (activeSince ?? Date.now()) : null; };
  update();
  document.addEventListener('visibilitychange', update);
}

function play(name: keyof typeof files) {
  if (!import.meta.client || activeSince === null) return;
  let element = audio.get(name);
  if (!element) { element = new Audio(files[name]); element.preload = 'auto'; audio.set(name, element); }
  element.currentTime = 0;
  // Browsers block audio until the person has interacted with the page; a blocked sound is skipped.
  void element.play().catch(() => {});
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
    play(name);
  }, delay);
}

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
