import { beforeEach, describe, expect, test, vi } from 'vitest';
import { searchReconcileWorkspaceJobDefinition } from './reconcile-workspace.js';
import type { JobExecutionContext, SearchReconcileWorkspacePayloadV1 } from '@thoth/job-protocol';

const { reconcileWorkspaceMock } = vi.hoisted(() => ({ reconcileWorkspaceMock: vi.fn() }));

vi.mock('../../search/search-context.js', () => ({
  getSearchService: () => ({ reconcileWorkspace: reconcileWorkspaceMock }),
}));

function makeContext(
  payload: SearchReconcileWorkspacePayloadV1,
  enqueueChild = vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' })
): JobExecutionContext<SearchReconcileWorkspacePayloadV1> {
  return {
    jobId: 'job-1',
    type: 'search.reconcile-workspace',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 3,
    signal: new AbortController().signal,
    now: () => new Date(),
    enqueueChild,
  };
}

describe('search.reconcile-workspace handler', () => {
  beforeEach(() => {
    reconcileWorkspaceMock.mockReset();
  });

  test('forwards continuations with the same dedupe key', async () => {
    const enqueueChild = vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' });
    reconcileWorkspaceMock.mockResolvedValue({
      nextCursor: { createdAt: '2024-01-01T00:00:00.000Z', id: 'page-2' },
      created: 1,
      updated: 0,
      skipped: 2,
      deleted: 0,
    });

    const result = await searchReconcileWorkspaceJobDefinition.handler(
      makeContext({ workspaceId: 'ws-1' }, enqueueChild)
    );

    expect(result).toMatchObject({ created: 1, skipped: 2 });
    expect(enqueueChild).toHaveBeenCalledWith({
      type: 'search.reconcile-workspace',
      payloadVersion: 1,
      payload: { workspaceId: 'ws-1', cursor: { createdAt: '2024-01-01T00:00:00.000Z', id: 'page-2' } },
      dedupeKey: 'search:workspace:ws-1',
    });
  });

  test('does not enqueue a child when the batch is complete', async () => {
    const enqueueChild = vi.fn();
    reconcileWorkspaceMock.mockResolvedValue({ created: 0, updated: 0, skipped: 1, deleted: 0 });

    await searchReconcileWorkspaceJobDefinition.handler(makeContext({ workspaceId: 'ws-1' }, enqueueChild));
    expect(enqueueChild).not.toHaveBeenCalled();
  });
});
