// Browser notifications (Web Push). The service worker is /sw.js; the API stores
// one subscription per browser on the current session (push/web-device). Opting in
// is remembered per account in this browser, so signing out stops notifications
// for that session and signing in again restores them without another prompt.
const supported = ref(false);
const permission = ref<NotificationPermission>('default');
const subscribed = ref(false);
const optInKey = (userID: string) => `wildcard.webPush.${userID}`;

function readOptIn(userID: string): boolean {
  try { return localStorage.getItem(optInKey(userID)) === '1'; } catch { return false; }
}
function writeOptIn(userID: string, on: boolean) {
  try { if (on) localStorage.setItem(optInKey(userID), '1'); else localStorage.removeItem(optInKey(userID)); } catch { /* Per-browser convenience only. */ }
}

function applicationKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function registration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

function refreshSupport() {
  supported.value = import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (supported.value) permission.value = Notification.permission;
}

async function send(subscription: PushSubscription, method: 'PUT' | 'DELETE') {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error(translate('errors.push.incompleteSubscription'));
  await api('push/web-device', { method, json: method === 'PUT'
    ? { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } : { endpoint: json.endpoint } });
}

async function subscribe(): Promise<void> {
  const { publicKey } = await api<{ publicKey: string }>('push/web-key');
  const worker = await registration();
  const key = applicationKey(publicKey);
  let subscription = await worker.pushManager.getSubscription();
  // A rotated VAPID key invalidates the old subscription.
  const current = subscription?.options.applicationServerKey;
  const hex = (bytes: ArrayLike<number>) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (subscription && current && hex(new Uint8Array(current)) !== hex(key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await send(subscription, 'PUT');
  subscribed.value = true;
}

async function enable(userID: string) {
  refreshSupport();
  if (!supported.value) throw new Error(translate('errors.push.unsupported'));
  // Must run inside the click that asked for it.
  permission.value = await Notification.requestPermission();
  if (permission.value !== 'granted') {
    throw new Error(permission.value === 'denied'
      ? translate('errors.push.blocked')
      : translate('errors.push.notEnabled'));
  }
  await subscribe();
  writeOptIn(userID, true);
}

async function disable(userID: string, forget = true) {
  refreshSupport();
  subscribed.value = false;
  if (forget) writeOptIn(userID, false);
  if (!supported.value) return;
  try {
    const subscription = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
    if (!subscription) return;
    try { await send(subscription, 'DELETE'); } catch { /* The session may already be gone; the browser unsubscribes anyway. */ }
    await subscription.unsubscribe();
  } catch { /* Nothing to remove. */ }
}

/** Restores this session's registration when the account opted in on this browser. */
async function sync(userID: string) {
  refreshSupport();
  subscribed.value = false;
  if (!supported.value || permission.value !== 'granted' || !readOptIn(userID)) return;
  try { await subscribe(); } catch { /* Retried on the next load. */ }
}

let activeUser: string | null = null;
export function useWebPush() {
  return { supported, permission, subscribed, enable, disable, sync, refreshSupport };
}

/** Called before the session cookie is cleared, while the API can still delete the device. */
export async function suspendWebPush() {
  if (activeUser) await disable(activeUser, false);
}

/** Root-app lifetime: restores the subscription after sign-in, relays push events to the page. */
export function useWebPushLifecycle() {
  const { status, user } = useSession();
  const chats = useChats();
  watch(() => [status.value, user.value?.id] as const, ([state, id]) => {
    activeUser = state === 'signed-in' && id ? id : null;
    if (activeUser) void sync(activeUser);
    else subscribed.value = false;
  }, { immediate: true });

  function onMessage(event: MessageEvent) {
    const data = event.data as { type?: string; url?: string } | null;
    if (data?.type === 'wildcard-push') void chats.refreshLists().catch(() => {});
    else if (data?.type === 'wildcard-open' && typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//')) void navigateTo(data.url);
  }
  // Polling pauses in hidden tabs; this slow refresh keeps the title count honest
  // for people who have not enabled notifications (timers in background tabs are throttled anyway).
  let hiddenTimer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    refreshSupport();
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage);
    hiddenTimer = setInterval(() => {
      if (document.visibilityState === 'hidden' && status.value === 'signed-in') void chats.refreshLists().catch(() => {});
    }, 30_000);
  });
  onBeforeUnmount(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
    clearInterval(hiddenTimer);
  });

  // "Wildcard (3)": unread messages across chats, as on the iOS app icon badge.
  const count = computed(() => status.value === 'signed-in' ? chats.totalUnread.value : 0);
  useHead({ title: () => count.value > 0 ? `Wildcard (${count.value > 99 ? '99+' : count.value})` : 'Wildcard' });
}
