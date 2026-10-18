import type { ApiError } from '@landscape/shared';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registers the callback that locks the UI when a request comes back 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: payload, credentials: 'same-origin', ...init });
  } catch (error) {
    throw new ApiRequestError(0, 'network', error instanceof Error ? error.message : 'Network error');
  }
  if (response.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized?.();
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const apiError = (data as ApiError | null)?.error;
    throw new ApiRequestError(
      response.status,
      apiError?.code ?? 'http_error',
      apiError?.message ?? `Request failed with status ${response.status}`,
      apiError?.details,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, file: File | Blob, fieldName = 'file') => {
    const form = new FormData();
    form.append(fieldName, file, file instanceof File ? file.name : 'upload');
    return request<T>('POST', url, form);
  },
};

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

/** Builds the WebSocket URL for a same-origin path. */
export function wsUrl(path: string): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${path}`;
}
