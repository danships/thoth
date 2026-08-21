import { beforeEach, describe, expect, test, vi } from 'vitest';
import { searchScanWorkspacesJobDefinition } from './scan-workspaces.js';
import type { JobExecutionContext, SearchScanWorkspacesPayloadV1 } from '@thoth/job-protocol';

const { getByQueryMock } = vi.hoisted(() => ({ getByQueryMock: vi.fn() }));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getWorkspaceRepository: async () => ({
      createQuery: () => ({}),
      getByQuery: getByQueryMock,
    }),
  };
});

function makeContext(
  payload: SearchScanWorkspacesPayloadV1,
  enqueueChild = vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' })
): JobExecutionContext<SearchScanWorkspacesPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'search.scan-workspaces',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 3,
    signal: new AbortController().signal,
    now: () => new Date(),
    enqueueChild,
  };
}

describe('search.scan-workspaces handler', () => {
  beforeEach(() => {
    getByQueryMock.mockReset();
  });

  test('enqueues live workspaces', async () => {
    getByQueryMock.mockResolvedValue([
      { id: 'ws-1', createdAt: '2024-01-01T00:00:00.000Z', deletedAt: null },
      { id: 'ws-2', createdAt: '2024-01-01T00:00:01.000Z', deletedAt: null },
      { id: 'ws-deleted', createdAt: '2024-01-01T00:00:02.000Z', deletedAt: '2024-01-02T00:00:00.000Z' },
    ]);
    const enqueueChild = vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' });

    const result = (await searchScanWorkspacesJobDefinition.handler(makeContext({}, enqueueChild))) as {
      workspacesScanned: number;
      workspacesEnqueued: number;
      continued: boolean;
    };

    expect(result).toEqual({ workspacesScanned: 2, workspacesEnqueued: 2, continued: false });
    expect(enqueueChild).toHaveBeenCalledTimes(2);
    expect(enqueueChild).toHaveBeenNthCalledWith(1, {
      type: 'search.reconcile-workspace',
      payloadVersion: 1,
      payload: { workspaceId: 'ws-1' },
      dedupeKey: 'search:workspace:ws-1',
    });
  });

  test('resumes strictly after the cursor and enqueues a scan continuation when more remain', async () => {
    getByQueryMock.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `ws-${String(index).padStart(3, '0')}`,
        createdAt: `2024-01-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
        deletedAt: null,
      }))
    );
    const enqueueChild = vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' });

    const result = (await searchScanWorkspacesJobDefinition.handler(
      makeContext({ cursor: { createdAt: '2024-01-01T00:00:00.000Z', id: 'ws-000' } }, enqueueChild)
    )) as { workspacesScanned: number; workspacesEnqueued: number; continued: boolean };

    expect(result.continued).toBe(false);
    expect(result.workspacesScanned).toBe(100);
  });
});
