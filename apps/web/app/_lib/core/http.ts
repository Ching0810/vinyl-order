/**
 * Minimal typed HTTP client for talking to the API.
 *
 * On any non-2xx it throws an HttpError carrying the parsed body, so React
 * Query and form handlers can react to 401/409 etc.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Thrown on any non-2xx response; carries the status and parsed error body. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`);
    this.name = 'HttpError';
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  // For FormData (file uploads) the browser must set Content-Type itself so it
  // can add the multipart boundary — so we only force JSON for non-FormData bodies.
  const isFormData = init.body instanceof FormData;

  const response = await fetch(new URL(path, BASE_URL), {
    ...init,
    // Send/receive the httpOnly auth cookie on cross-origin requests.
    // (The API's CORS allowlist + credentials:true makes this work.)
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  // 204 No Content has no body; otherwise parse JSON (tolerate empty/non-JSON).
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    throw new HttpError(response.status, body);
  }

  return body as T;
};

const toQueryString = (params: QueryParams): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const http = {
  get<T>(path: string, params: QueryParams = {}): Promise<T> {
    return request<T>(`${path}${toQueryString(params)}`, { method: 'GET' });
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' });
  },
  /** POST a multipart body (file uploads). Pass a FormData; no JSON header. */
  postForm<T>(path: string, form: FormData): Promise<T> {
    return request<T>(path, { method: 'POST', body: form });
  },
};
