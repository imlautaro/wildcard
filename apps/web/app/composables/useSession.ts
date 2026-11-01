import type { AuthUser, Features } from '~/utils/types';

// Session-owned state. Every cache registers a reset so signing out, an expired
// session, or switching accounts never shows another account's data.
const user = ref<AuthUser | null>(null);
const status = ref<'unknown' | 'signed-in' | 'signed-out' | 'unreachable'>('unknown');
// Feature switches from GET /me; absent until a profile load returns them.
const features = ref<Features | null>(null);
type Profile = { user: AuthUser; features?: Features };
const resetters = new Set<() => void>();
const modelListeners = new Set<(contributor: boolean) => void>();

export function registerModelChange(listener: (contributor: boolean) => void) {
  modelListeners.add(listener);
}
let restoring: Promise<void> | null = null;
let profileRequest: Promise<void> | null = null;
let profileRevision = 0;

export function registerSessionReset(reset: () => void) {
  resetters.add(reset);
}

function resetCaches() {
  profileRevision += 1;
  features.value = null;
  profileRequest = null;
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
  restoring ??= api<Profile>('me')
    .then((result) => {
      user.value = result.user;
      features.value = result.features ?? null;
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
  user.value = { ...result.user, onboardingRequired: true };
  try {
    const profile = await api<Profile>('me');
    user.value = profile.user;
    features.value = profile.features ?? null;
  }
  catch (failure) {
    if (failure instanceof ApiError && failure.status === 401) {
      resetCaches(); user.value = null; status.value = 'signed-out';
      throw failure;
    }
    // A temporary profile failure keeps setup gated until the next refresh.
  }
  status.value = 'signed-in';
}

async function signOut() {
  // The API can only delete this browser's push device while the session is valid.
  await suspendWebPush().catch(() => {});
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

async function refreshProfile() {
  if (status.value !== 'signed-in') return;
  const owner = user.value?.id;
  const revision = profileRevision;
  profileRequest ??= api<Profile>('me').then((result) => {
    if (revision !== profileRevision || status.value !== 'signed-in' || user.value?.id !== owner) return;
    const changed = user.value?.chatModel !== result.user.chatModel;
    user.value = result.user;
    features.value = result.features ?? null;
    if (changed) for (const listener of modelListeners) listener(result.user.chatModel === 'muse-spark-1.3-contributor');
  }).finally(() => { if (revision === profileRevision) profileRequest = null; });
  await profileRequest;
}

async function saveModel(chatModel: string, contributorConsent: boolean) {
  const owner = user.value?.id;
  const revision = ++profileRevision;
  profileRequest = null;
  const result = await api<{ user: AuthUser }>('me/model', { method: 'PUT', json: { chatModel, contributorConsent } });
  if (revision !== profileRevision || status.value !== 'signed-in' || user.value?.id !== owner) return;
  user.value = result.user;
  for (const listener of modelListeners) listener(result.user.chatModel === 'muse-spark-1.3-contributor');
}

export function useSession() {
  return { user: readonly(user), features: readonly(features), status: readonly(status), restore, authenticate, signOut, saveName, savePhoto, saveModel, refreshProfile };
}
