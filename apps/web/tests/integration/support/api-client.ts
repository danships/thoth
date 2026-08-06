// tests/integration/support/api-client.ts
//
// Typed HTTP helpers for the integration test suite.
// Uses native `fetch` with cookie jar management for Better Auth sessions.

import { SEED } from '../../fixtures/seed';

/** Parsed Set-Cookie name=value pairs (no attributes). */
type CookieJar = Map<string, string>;

function parseCookieJar(response: Response): CookieJar {
  const jar: CookieJar = new Map();
  const setCookieHeaders =
    typeof (response.headers as { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (response.headers as { getSetCookie: () => string[] }).getSetCookie()
      : ([response.headers.get('set-cookie')].filter(Boolean) as string[]);

  for (const header of setCookieHeaders) {
    const parts = header.split(';');
    const nameValue = parts[0]?.trim();
    if (!nameValue) continue;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) continue;
    jar.set(nameValue.slice(0, eqIndex), nameValue.slice(eqIndex + 1));
  }
  return jar;
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export type ApiClient = {
  /** Make a GET request. */
  get: (path: string, options?: RequestOptions) => Promise<ApiResponse>;
  /** Make a POST request. */
  post: (path: string, body?: unknown, options?: RequestOptions) => Promise<ApiResponse>;
  /** Make a PATCH request. */
  patch: (path: string, body?: unknown, options?: RequestOptions) => Promise<ApiResponse>;
  /** Make a PUT request. */
  put: (path: string, body?: unknown, options?: RequestOptions) => Promise<ApiResponse>;
  /** Make a DELETE request. */
  delete: (path: string, options?: RequestOptions) => Promise<ApiResponse>;
  /** Make a raw fetch request with full control. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  /** The base URL of the test server. */
  baseUrl: string;
};

type RequestOptions = {
  params?: Record<string, string>;
  headers?: Record<string, string>;
};

export type ApiResponse = {
  status: number;
  ok: boolean;
  headers: Headers;
  json: <T = unknown>() => Promise<T>;
  text: () => Promise<string>;
  raw: Response;
};

function wrapResponse(response: Response): ApiResponse {
  // Buffer the body once
  let bodyText: string | undefined;
  const textPromise = async () => {
    if (bodyText === undefined) bodyText = await response.text();
    return bodyText;
  };
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    json: async <T = unknown>() => JSON.parse(await textPromise()) as T,
    text: textPromise,
    raw: response,
  };
}

function buildUrl(baseUrl: string, path: string, parameters?: Record<string, string>): string {
  const url = new URL(path, baseUrl);
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/** Create an unauthenticated API client (no cookies, no bearer). */
export function createAnonymousClient(baseUrl: string): ApiClient {
  return createClientInternal(baseUrl, new Map(), undefined);
}

/** Create an API client authenticated with a bearer token. */
export function createBearerClient(baseUrl: string, token: string): ApiClient {
  return createClientInternal(baseUrl, new Map(), token);
}

/** Sign in via Better Auth and return an authenticated API client with session cookies. */
export async function createSessionClient(
  baseUrl: string,
  credentials: { email: string; password: string }
): Promise<ApiClient> {
  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    redirect: 'manual',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sign-in failed (${response.status}): ${body}`);
  }

  const jar = parseCookieJar(response);
  return createClientInternal(baseUrl, jar, undefined);
}

function createClientInternal(baseUrl: string, jar: CookieJar, bearerToken: string | undefined): ApiClient {
  const doFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const headers = new Headers(init?.headers);
    if (jar.size > 0) {
      headers.set('Cookie', cookieHeader(jar));
    }
    if (bearerToken) {
      headers.set('Authorization', `Bearer ${bearerToken}`);
    }
    const response = await fetch(url, { ...init, headers, redirect: 'manual' });
    // Update cookies from response
    const newCookies = parseCookieJar(response);
    if (newCookies.size > 0) {
      for (const [name, value] of newCookies) {
        jar.set(name, value);
      }
    }
    return response;
  };

  const jsonRequest = async (
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse> => {
    const url = buildUrl(baseUrl, path, options?.params);
    const headers: Record<string, string> = options?.headers ? { ...options.headers } : {};

    if (body === undefined) {
      const response = await doFetch(url, {
        method,
        headers,
      });
      return wrapResponse(response);
    }

    const response = await doFetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    return wrapResponse(response);
  };

  return {
    get: (path, options) => jsonRequest('GET', path, undefined, options),
    post: (path, body, options) => jsonRequest('POST', path, body, options),
    patch: (path, body, options) => jsonRequest('PATCH', path, body, options),
    put: (path, body, options) => jsonRequest('PUT', path, body, options),
    delete: (path, options) => jsonRequest('DELETE', path, undefined, options),
    fetch: doFetch,
    baseUrl,
  };
}

// ── Pre-built client factories keyed to seeded identities ─────────────────────

const clientCache = new Map<string, ApiClient>();

/** Get a session-authenticated client for the primary seed user. */
export async function getOwnerClient(baseUrl: string): Promise<ApiClient> {
  const key = `owner:${baseUrl}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, await createSessionClient(baseUrl, SEED.user));
  }
  return clientCache.get(key)!;
}

/** Get a session-authenticated client for the second seed user (read_write member). */
export async function getSecondUserClient(baseUrl: string): Promise<ApiClient> {
  const key = `second:${baseUrl}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, await createSessionClient(baseUrl, SEED.secondUser));
  }
  return clientCache.get(key)!;
}

/** Get a session-authenticated client for the third seed user (read-only member). */
export async function getThirdUserClient(baseUrl: string): Promise<ApiClient> {
  const key = `third:${baseUrl}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, await createSessionClient(baseUrl, SEED.thirdUser));
  }
  return clientCache.get(key)!;
}

/** Unwrap the `.data` property from a standard API response. */
export async function getData<T = unknown>(response: ApiResponse): Promise<T> {
  const body = await response.json<{ data: T }>();
  return body.data;
}
