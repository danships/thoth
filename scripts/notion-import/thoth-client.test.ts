import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThothClient, ThothApiError } from './thoth-client';

const BASE_URL = 'https://thoth.example.com/api/v1';
const API_KEY = 'thk_test';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { status: 200, ...init });
}

function client() {
  return new ThothClient(BASE_URL, API_KEY, { maxAttempts: 3, baseDelayMs: 1, sleep: () => Promise.resolve() });
}

describe('ThothClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the Authorization bearer header and unwraps the {data} envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { id: 'page-1', name: 'Home' } }));
    const result = await client().createPage({ name: 'Home' });
    expect(result).toEqual({ id: 'page-1', name: 'Home' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ' + API_KEY);
  });

  it('retries on 429 honouring Retry-After, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { values: {} } }));

    const result = await client().getPageValues('page-1');
    expect(result).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx and eventually throws ThothApiError after exhausting attempts', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(client().validateConnection()).rejects.toThrow(ThothApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-idempotent resource-creation calls on 429/5xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '0' } }));
    await expect(client().createDataSource({ name: 'DB' })).rejects.toThrow(ThothApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws ThothApiError immediately on a non-retryable 4xx status', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'bad request' }, { status: 400 }));
    await expect(client().createPage({ name: 'X' })).rejects.toThrow(ThothApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uploads a file via multipart/form-data and returns the parsed response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: { id: 'file-1', url: 'https://cdn/f1', filename: 'f1.png' } })
    );
    const result = await client().uploadFile({
      filename: 'f1.png',
      mimeType: 'image/png',
      data: Buffer.from('abc'),
      pageId: 'page-1',
    });
    expect(result).toEqual({ id: 'file-1', url: 'https://cdn/f1', filename: 'f1.png' });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
  });
});
