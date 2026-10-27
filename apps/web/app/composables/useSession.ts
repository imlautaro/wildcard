import type { AuthUser } from '~/utils/types';

// Session-owned state. Every cache registers a reset so signing out, an expired
// session, or switching accounts never shows another account's data.
const user = ref<AuthUser | null>(null);
const status = ref<'unknown' | 'signed-in' | 'signed-out' | 'unreachable'>('unknown');
const resetters = new Set<() => void>();
let restoring: Promise<void> | null = null;

export function registerSessionReset(reset: () => void) {
  resetters.add(reset);
}

function resetCaches() {
  for (const reset of resetters) reset();
}

function expire() {
  if (status.value === 'signed-out') return;
  resetCaches();
  user.value = null;
  status.value = 'signed-out';
  void navigateTo('/sign-in');
}
onUnauthorized(expire);

async function restore() {
  if (status.value === 'signed-in' || status.value === 'signed-out') return;
  restoring ??= api<{ user: AuthUser }>('me')
    .then((result) => {
      user.value = result.user;
      status.value = 'signed-in';
    })
    .catch((error) => {
      if (error instanceof ApiError && error.status === 401) status.value = 'signed-out';
      else status.value = 'unreachable';
    })
    .finally(() => { restoring = null; });
  await restoring;
}

async function authenticate(email: string, password: string, name: string | null) {
  const path = name === null ? 'auth/sign-in/email' : 'auth/sign-up/email';
  const result = await api<{ user: AuthUser }>(path, { json: name === null ? { email, password } : { name, email, password } });
  if (user.value?.id !== result.user.id) resetCaches();
  user.value = result.user;
  status.value = 'signed-in';
}

async function signOut() {
  try { await api('auth/sign-out', { json: {} }); }
  catch { /* The Worker clears the cookie even when the API is unreachable. */ }
  resetCaches();
  user.value = null;
  status.value = 'signed-out';
  await navigateTo('/sign-in');
}

async function saveName(name: string) {
  user.value = (await api<{ user: AuthUser }>('me', { method: 'PATCH', json: { name } })).user;
}

async function savePhoto(photo: Blob | null) {
  const result = photo
    ? await api<{ user: AuthUser }>('me/photo', { method: 'PUT', body: photo })
    : await api<{ user: AuthUser }>('me/photo', { method: 'DELETE' });
  user.value = result.user;
}

export function useSession() {
  return { user: readonly(user), status: readonly(status), restore, authenticate, signOut, saveName, savePhoto };
}
