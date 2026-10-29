import type { AdminUser } from '~/utils/types';

// Session-owned state. Every cache registers a reset so signing out, an expired
// session, or switching accounts never shows another account's data.
// `forbidden` is a valid Wildcard session whose user is not on the roster.
const user = ref<AdminUser | null>(null);
const status = ref<'unknown' | 'signed-in' | 'signed-out' | 'forbidden' | 'unreachable'>('unknown');
const forbiddenUserID = ref<string | null>(null);
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

async function loadSession() {
  try {
    user.value = (await api<{ user: AdminUser }>('admin/session')).user;
    forbiddenUserID.value = null;
    status.value = 'signed-in';
  } catch (error) {
    user.value = null;
    if (error instanceof ApiError && error.code === 'NOT_SUPER_ADMIN') {
      forbiddenUserID.value = typeof error.body?.userID === 'string' ? error.body.userID : null;
      status.value = 'forbidden';
    } else if (error instanceof ApiError && error.status === 401) {
      status.value = 'signed-out';
    } else {
      status.value = 'unreachable';
    }
  }
}

async function restore() {
  if (status.value !== 'unknown' && status.value !== 'unreachable') return;
  restoring ??= loadSession().finally(() => { restoring = null; });
  await restoring;
}

async function signIn(email: string, password: string) {
  await api('auth/sign-in/email', { json: { email, password } });
  resetCaches();
  await loadSession();
  if (status.value === 'unreachable') throw new ApiError('Unable to reach Wildcard. Check your connection and try again.', 0);
}

async function signOut() {
  try { await api('auth/sign-out', { json: {} }); }
  catch { /* The Worker clears the cookie even when the API is unreachable. */ }
  resetCaches();
  user.value = null;
  forbiddenUserID.value = null;
  status.value = 'signed-out';
  await navigateTo('/sign-in');
}

export function useSession() {
  return { user: readonly(user), status: readonly(status), forbiddenUserID: readonly(forbiddenUserID), restore, signIn, signOut };
}
