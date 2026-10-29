// Same-origin client for the Worker proxy at /api/v1. The admin panel shows the
// API's own error text, which is written for operators.
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly body?: Record<string, unknown>) {
    super(message);
  }
}

type Options = { method?: string; json?: unknown; query?: Record<string, string | undefined>; signal?: AbortSignal };

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

function serverMessage(body: Record<string, unknown> | null): string | null {
  const message = body?.error;
  return typeof message === 'string' && message.trim() && [...message].length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/u.test(message)
    ? message : null;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const method = options.method ?? (options.json === undefined ? 'GET' : 'POST');
  const url = new URL(`/api/v1/${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(url, {
      method, headers, body: options.json === undefined ? undefined : JSON.stringify(options.json),
      signal: options.signal, credentials: 'same-origin', cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Unable to reach Wildcard. Check your connection and try again.', 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok) return data as T;
  const isCredentialRequest = path.startsWith('auth/');
  if (response.status === 401 && !isCredentialRequest) {
    unauthorizedHandler?.();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }
  const code = typeof data?.code === 'string' ? data.code : undefined;
  let message = serverMessage(data) ?? 'Unable to complete the request. Please try again later.';
  if (response.status === 401) message = 'Incorrect email or password.';
  if (response.status === 429) message = serverMessage(data) ?? 'Too many attempts. Please wait a minute and try again.';
  throw new ApiError(message, response.status, code, data ?? undefined);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export function isTransientFailure(error: unknown) {
  return error instanceof ApiError && (error.status === 0 || [502, 503, 504].includes(error.status));
}
