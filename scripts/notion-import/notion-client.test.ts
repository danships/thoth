import { describe, it, expect, vi } from 'vitest';
import { APIResponseError, APIErrorCode, type Client } from '@notionhq/client';
import { NotionClient } from './notion-client';

function notFoundError(): APIResponseError {
  return new APIResponseError({
    code: APIErrorCode.ObjectNotFound,
    status: 404,
    message: 'not found',
    headers: new Headers(),
    rawBodyText: '{}',
    additional_data: undefined,
    request_id: undefined,
  });
}

function unauthorizedError(): APIResponseError {
  return new APIResponseError({
    code: APIErrorCode.Unauthorized,
    status: 401,
    message: 'API token is invalid',
    headers: new Headers(),
    rawBodyText: '{}',
    additional_data: undefined,
    request_id: undefined,
  });
}

const FULL_PAGE = {
  object: 'page' as const,
  id: 'page-1',
  url: 'https://notion.so/page-1',
  archived: false,
  last_edited_time: '2024-01-01T00:00:00.000Z',
  icon: null,
  properties: {},
  parent: { type: 'workspace' },
};

const FULL_DATA_SOURCE = {
  object: 'data_source' as const,
  id: 'ds-1',
  archived: false,
  last_edited_time: '2024-01-01T00:00:00.000Z',
  title: [],
  properties: {},
};

describe('NotionClient.retrieve', () => {
  it('falls back from pages.retrieve to dataSources.retrieve on an expected not-found error', async () => {
    const fakeClient = {
      pages: { retrieve: vi.fn().mockRejectedValue(notFoundError()) },
      dataSources: { retrieve: vi.fn().mockResolvedValue(FULL_DATA_SOURCE) },
      databases: { retrieve: vi.fn() },
    } as unknown as Client;

    const client = new NotionClient('token', fakeClient);
    const result = await client.retrieve('ds-1');
    expect(result).toMatchObject({ object: 'database', id: 'ds-1' });
    expect(fakeClient.databases.retrieve).not.toHaveBeenCalled();
  });

  it('falls back from dataSources.retrieve to databases.retrieve on an expected not-found error', async () => {
    const fakeClient = {
      pages: { retrieve: vi.fn().mockRejectedValue(notFoundError()) },
      dataSources: { retrieve: vi.fn().mockRejectedValue(notFoundError()) },
      databases: {
        retrieve: vi.fn().mockResolvedValue({ data_sources: [] }),
      },
    } as unknown as Client;

    const client = new NotionClient('token', fakeClient);
    const result = await client.retrieve('legacy-db-1');
    expect(result).toBeNull();
  });

  it('rethrows an unexpected error from pages.retrieve instead of silently falling back', async () => {
    const fakeClient = {
      pages: { retrieve: vi.fn().mockRejectedValue(unauthorizedError()) },
      dataSources: { retrieve: vi.fn() },
      databases: { retrieve: vi.fn() },
    } as unknown as Client;

    const client = new NotionClient('token', fakeClient);
    await expect(client.retrieve('page-1')).rejects.toThrow(APIResponseError);
    expect(fakeClient.dataSources.retrieve).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected error from databases.retrieve instead of returning null', async () => {
    const fakeClient = {
      pages: { retrieve: vi.fn().mockRejectedValue(notFoundError()) },
      dataSources: { retrieve: vi.fn().mockRejectedValue(notFoundError()) },
      databases: { retrieve: vi.fn().mockRejectedValue(unauthorizedError()) },
    } as unknown as Client;

    const client = new NotionClient('token', fakeClient);
    await expect(client.retrieve('some-id')).rejects.toThrow(APIResponseError);
  });

  it('returns the page when pages.retrieve succeeds', async () => {
    const fakeClient = {
      pages: { retrieve: vi.fn().mockResolvedValue(FULL_PAGE) },
      dataSources: { retrieve: vi.fn() },
      databases: { retrieve: vi.fn() },
    } as unknown as Client;

    const client = new NotionClient('token', fakeClient);
    const result = await client.retrieve('page-1');
    expect(result).toMatchObject({ object: 'page', id: 'page-1' });
    expect(fakeClient.dataSources.retrieve).not.toHaveBeenCalled();
  });
});
