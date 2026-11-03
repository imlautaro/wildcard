// Same-origin client for the Worker proxy at /api/v1. Error copy follows the
// iOS AuthAPI mapping so both clients explain failures the same way. Client-side
// fallbacks are localized (errors.*); server messages pass through unchanged.
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

// Sends refused for missing Contributor consent (docs/model-settings.md#sharing-and-mcp).
function consentMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const { code, contributorOnly, selfConsentMissing } = body as Record<string, unknown>;
  const reason = code === 'CONTACT_CONTRIBUTOR_CONSENT_REQUIRED' ? translate('errors.contactContributorConsent')
    : code === 'GROUP_CONTRIBUTOR_CONSENT_REQUIRED'
      ? translate(selfConsentMissing === true ? 'errors.groupContributorConsentSelf' : 'errors.groupContributorConsentOthers')
      : null;
  return reason && contributorOnly === true ? `${reason} ${translate('errors.contributorOnlyActive')}` : reason;
}

function failureMessage(path: string, method: string, status: number, body: unknown): string {
  const consent = consentMessage(body);
  if (consent) return consent;
  if (path === 'me/debug-export') return serverMessage(body) ?? translate('errors.debugExportFailed');
  // Per-chat JSON export (docs/chat-export.md): the API's messages are accurate for every status.
  if (/^(contacts\/[^/]+\/chat|groups\/[^/]+)\/export$/.test(path)) {
    return status === 429 ? translate('errors.chatExportRateLimited') : serverMessage(body) ?? translate('errors.chatExportFailed');
  }
  if (path.startsWith('push/')) return serverMessage(body) ?? translate('errors.notificationsUnavailable');
  if (path.startsWith('onboarding')) return serverMessage(body) ?? translate('errors.setupUnavailable');
  if (path === 'contacts/generation') return serverMessage(body) ?? translate('errors.contactGenerationUnavailable');
  if (path.includes('/personality')) return serverMessage(body) ?? translate('errors.personalityUnavailable');
  if (path.includes('/mcp')) return serverMessage(body) ?? translate('errors.connectionsUnavailable');
  if (path.includes('/mini-apps')) return serverMessage(body) ?? translate('errors.miniAppsUnavailable');
  // Sticker routes (docs/stickers.md): the API's own messages are accurate for every status.
  if (path === 'stickers' || path.startsWith('stickers/') || path.startsWith('stickers?') || path.includes('/stickers')) {
    return serverMessage(body) ?? translate('errors.stickersUnavailable');
  }
  if (path.endsWith('/reactions')) return serverMessage(body) ?? translate('errors.reactionsUnavailable');
  if (path === 'home' || path.startsWith('home/')) return status === 429 || status >= 500
    ? translate('errors.forYouUnavailable') : serverMessage(body) ?? translate('errors.forYouUnavailable');
  if (path === 'voices' || path.startsWith('voices/')) {
    if (status === 404) return translate('errors.voiceGone');
    return translate('errors.voicesUnavailable');
  }
  if (path.endsWith('/voice') || path.endsWith('/voice-messages')) {
    if (path.endsWith('/voice') && status === 403) return translate('errors.voiceCreatorOnly');
    if (status === 404) return translate('errors.contactGone');
    return serverMessage(body) ?? translate('errors.voiceSaveFailed');
  }
  if (path.startsWith('groups')) {
    if (status === 429 || status >= 500) return translate('errors.groupsUnavailable');
    if (status === 404 && method === 'GET' && !path.includes('/photos/')) return translate('errors.groupGone');
    if ([400, 403, 404, 409, 413, 422].includes(status)) return serverMessage(body) ?? translate('errors.groupsUnavailable');
    return translate('errors.groupsUnavailable');
  }
  if (path === 'me' && method === 'DELETE') {
    const code = body && typeof body === 'object' ? (body as Record<string, unknown>).code : null;
    if (code === 'INCORRECT_PASSWORD' || code === 'PASSWORD_REQUIRED') return translate('errors.accountDeletePassword');
    if (code === 'SUPER_ADMIN') return translate('errors.accountDeleteSuperAdmin');
    if (status === 429) return translate('errors.rateLimited');
    return translate('errors.accountDeleteFailed');
  }
  if (path === 'me' && [400, 422].includes(status)) return translate('errors.invalidName');
  if (path === 'me/photo' && status === 409) return translate('errors.profileChanged');
  if (path.startsWith('contacts/sharing/')) {
    if ([400, 403, 404, 409, 413, 422, 429].includes(status)) return serverMessage(body) ?? translate('errors.contactSharingUnavailable');
    return translate('errors.contactSharingUnavailable');
  }
  if (path.endsWith('/photo')) {
    if ([400, 413, 415, 422].includes(status)) return translate('errors.invalidPhoto');
    if (status === 409) return translate('errors.contactChanged');
  }
  if (path.includes('/chat/')) {
    if (status === 413) return translate('errors.fileTooLarge');
    if (status === 400 && serverMessage(body)) return serverMessage(body)!;
    if (status === 400 || status === 422) return translate('errors.invalidMessage');
    if (status === 403 && serverMessage(body)) return serverMessage(body)!;
    if (status === 409) return translate('errors.replyConflict');
    if (status === 503) return translate('errors.aiUnavailable');
  }
  // Super admins can close registration at runtime (docs/admin.md).
  if (path === 'auth/sign-up/email' && status === 403) return translate('errors.registrationClosed');
  if (status === 401) return translate('errors.invalidCredentials');
  if (status === 429) return translate('errors.rateLimited');
  if (status === 400 || status === 422) {
    if (path.startsWith('contacts')) return translate('errors.invalidContactName');
    return translate('errors.checkDetails');
  }
  if (status === 404 && path.startsWith('contacts/')) return translate('errors.contactGone');
  if (status === 409) return translate('errors.accountConflict');
  return translate('errors.requestFailed');
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
    throw new ApiError(translate('errors.unreachable'), 0);
  }
  if (response.ok) return response;
  const data: unknown = await response.json().catch(() => null);
  const isCredentialRequest = path.startsWith('auth/');
  if (response.status === 401 && !isCredentialRequest) {
    unauthorizedHandler?.();
    throw new ApiError(translate('errors.sessionExpired'), 401);
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
  return error instanceof Error ? error.message : translate('errors.generic');
}

// Connectivity and gateway failures that the next background poll retries. Stores
// keep cached content visible instead of surfacing these after a first load.
export function isTransientFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || [502, 503, 504].includes(error.status));
}

export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
