import { beforeEach, describe, expect, test, vi } from 'vitest';
import { searchSyncPageJobDefinition } from './sync-page.js';
import type { JobExecutionContext, SearchSyncPagePayloadV1 } from '@thoth/job-protocol';

const { syncPageMock } = vi.hoisted(() => ({ syncPageMock: vi.fn() }));

vi.mock('../../search/search-context.js', () => ({
  getSearchService: () => ({ syncPage: syncPageMock }),
}));

function makeContext(payload: SearchSyncPagePayloadV1): JobExecutionContext<SearchSyncPagePayloadV1> {
  return {
    jobId: 'job-1',
    type: 'search.sync-page',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 5,
    signal: new AbortController().signal,
    now: () => new Date(),
    enqueueChild: vi.fn(),
  };
}

describe('search.sync-page handler', () => {
  beforeEach(() => {
    syncPageMock.mockReset();
  });

  test('delegates to the search service', async () => {
    syncPageMock.mockResolvedValue('updated');
    await expect(
      searchSyncPageJobDefinition.handler(makeContext({ workspaceId: 'ws-1', pageId: 'page-1' }))
    ).resolves.toBe('updated');
    expect(syncPageMock).toHaveBeenCalledWith({ workspaceId: 'ws-1', pageId: 'page-1' });
  });
});
