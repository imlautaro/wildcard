// Same-origin client for the Worker proxy at /api/v1. Error copy follows the
// iOS AuthAPI mapping so both clients explain failures the same way.
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly retryAfter?: number) {
    super(message);
  }
}

type Options = {
  method?: string;
  json?: unknown;
  body?: Blob;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

function serverMessage(body: unknown): string | null {
  const message = body && typeof body === 'object' && 'error' in body ? (body as { error: unknown }).error : null;
  return typeof message === 'string' && message.trim() && [...message].length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/u.test(message)
    ? message : null;
}

function failureMessage(path: string, method: string, status: number, body: unknown): string {
  if (path === 'me/debug-export') return serverMessage(body) ?? 'The export could not be completed. Please try again.';
  // Per-chat JSON export (docs/chat-export.md): the API's messages are accurate for every status.
  if (/^(contacts\/[^/]+\/chat|groups\/[^/]+)\/export$/.test(path)) {
    return status === 429 ? 'Too many exports. Please wait a minute and try again.' : serverMessage(body) ?? 'The chat could not be exported. Please try again.';
  }
  if (path.startsWith('push/')) return serverMessage(body) ?? 'Notifications are temporarily unavailable. Please try again.';
  if (path.startsWith('onboarding')) return serverMessage(body) ?? 'Setup is temporarily unavailable. Please try again.';
  if (path === 'contacts/generation') return serverMessage(body) ?? 'Contact generation is temporarily unavailable. Please try again.';
  if (path.includes('/personality')) return serverMessage(body) ?? 'Personality is temporarily unavailable. Please try again.';
  if (path.includes('/mcp')) return serverMessage(body) ?? 'Connections are temporarily unavailable. Please try again.';
  if (path.includes('/mini-apps')) return serverMessage(body) ?? 'Mini apps are temporarily unavailable. Please try again.';
  // Sticker routes (docs/stickers.md): the API's own messages are accurate for every status.
  if (path === 'stickers' || path.startsWith('stickers/') || path.startsWith('stickers?') || path.includes('/stickers')) {
    return serverMessage(body) ?? 'Stickers are temporarily unavailable. Please try again.';
  }
  if (path.endsWith('/reactions')) return serverMessage(body) ?? 'Reactions are temporarily unavailable. Please try again.';
  if (path === 'home' || path.startsWith('home/')) return status === 429 || status >= 500
    ? 'For you is temporarily unavailable. Please try again.' : serverMessage(body) ?? 'For you is temporarily unavailable. Please try again.';
  if (path === 'voices' || path.startsWith('voices/')) {
    if (status === 404) return 'This voice is no longer available.';
    return 'Voices are unavailable right now. Please try again.';
  }
  if (path.endsWith('/voice') || path.endsWith('/voice-messages')) {
    if (path.endsWith('/voice') && status === 403) return "Only the contact's creator can change its voice.";
    if (status === 404) return 'This contact is no longer available.';
    return serverMessage(body) ?? 'Voice settings could not be saved. Please try again.';
  }
  if (path.startsWith('groups')) {
    if (status === 429 || status >= 500) return 'Groups are temporarily unavailable. Please try again.';
    if (status === 404 && method === 'GET' && !path.includes('/photos/')) return 'This group is no longer available.';
    if ([400, 403, 404, 409, 413, 422].includes(status)) return serverMessage(body) ?? 'Groups are temporarily unavailable. Please try again.';
    return 'Groups are temporarily unavailable. Please try again.';
  }
  if (path === 'me' && [400, 422].includes(status)) return 'Use a name with 1–100 characters and no control characters.';
  if (path === 'me/photo' && status === 409) return 'Your profile changed. Go back, refresh, and try again.';
  if (path.startsWith('contacts/sharing/')) {
    if ([400, 403, 404, 409, 413, 422, 429].includes(status)) return serverMessage(body) ?? 'Contact sharing is temporarily unavailable. Please try again.';
    return 'Contact sharing is temporarily unavailable. Please try again.';
  }
  if (path.endsWith('/photo')) {
    if ([400, 413, 415, 422].includes(status)) return 'Choose a square JPEG photo smaller than 512 KB.';
    if (status === 409) return 'This contact changed. Go back, refresh, and try again.';
  }
  if (path.includes('/chat/')) {
    if (status === 413) return 'Choose a file up to 5 MB.';
    if (status === 400 && serverMessage(body)) return serverMessage(body)!;
    if (status === 400 || status === 422) return 'Use a message with 1–4,000 characters.';
    if (status === 403 && serverMessage(body)) return serverMessage(body)!;
    if (status === 409) return 'A reply is already in progress or the conversation changed. Refresh and try again.';
    if (status === 503) return 'AI replies are temporarily unavailable. Please try again later.';
  }
  // Super admins can close registration at runtime (docs/admin.md).
  if (path === 'auth/sign-up/email' && status === 403) return 'New accounts are not being accepted right now. Existing accounts can still sign in.';
  if (status === 401) return 'Incorrect email or password.';
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (status === 400 || status === 422) {
    if (path.startsWith('contacts')) return 'Use a contact name with 1–100 characters and no control characters.';
    return 'Check your details, or try signing in if you already have an account.';
  }
  if (status === 404 && path.startsWith('contacts/')) return 'This contact is no longer available.';
  if (status === 409) return 'Unable to create this account. Try signing in instead.';
  return 'Unable to complete the request. Please try again later.';
}

async function request(path: string, options: Options = {}): Promise<Response> {
  const method = options.method ?? (options.json === undefined && !options.body ? 'GET' : 'POST');
  const url = new URL(`/api/v1/${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.body) {
    headers['Content-Type'] = options.body.type;
    body = options.body;
  }
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: options.signal, credentials: 'same-origin', cache: 'no-store' });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Unable to reach Wildcard. Check your connection and try again.', 0);
  }
  if (response.ok) return response;
  const data: unknown = await response.json().catch(() => null);
  const isCredentialRequest = path.startsWith('auth/');
  if (response.status === 401 && !isCredentialRequest) {
    unauthorizedHandler?.();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }
  const code = data && typeof data === 'object' && 'code' in data ? String((data as { code: unknown }).code) : undefined;
  const retryAfter = Number(response.headers.get('Retry-After'));
  throw new ApiError(failureMessage(path, method, response.status, data), response.status, code, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function apiBlob(path: string, options: Options = {}): Promise<Blob> {
  return await (await request(path, options)).blob();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

// Connectivity and gateway failures that the next background poll retries. Stores
// keep cached content visible instead of surfacing these after a first load.
export function isTransientFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || [502, 503, 504].includes(error.status));
}

export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
