/**
 * Minimal typed HTTP client for talking to the API.
 *
 * On any non-2xx it throws an HttpError carrying the parsed body, so React
 * Query and form handlers can react to 401/409 etc.
 */

// /api by default: this app forwards it to the API (next.config.ts), so the
// browser only ever talks to one site. Paths start with "/" and are appended,
// not resolved — new URL('/products', base) would drop the base's own path, and
// throws when the base is relative.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    // Through /api the requests are same-origin and carry the httpOnly auth
    // cookie anyway; 'include' keeps it working if NEXT_PUBLIC_API_URL names
    // the API directly (then the API's CORS allowlist must admit this origin).
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
  /**
   * @param headers - extra headers for this call alone (e.g. Idempotency-Key)
   */
  post<T>(path: string, body?: unknown, headers?: HeadersInit): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
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
