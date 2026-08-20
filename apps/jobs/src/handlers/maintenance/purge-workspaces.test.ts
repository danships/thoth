import { beforeEach, describe, expect, test, vi } from 'vitest';
import { maintenancePurgeWorkspacesJobDefinition, type MaintenancePurgeWorkspacesResult } from './purge-workspaces.js';
import type { JobExecutionContext, MaintenancePurgeWorkspacesPayloadV1 } from '@thoth/job-protocol';

const {
  selectPurgeableWorkspacesMock,
  revalidateWorkspaceForPurgeMock,
  cascadeDeleteWorkspaceMock,
  graceThresholdMsMock,
  deleteMock,
  deleteWorkspaceIndexMock,
} = vi.hoisted(() => ({
  selectPurgeableWorkspacesMock: vi.fn(),
  revalidateWorkspaceForPurgeMock: vi.fn(),
  cascadeDeleteWorkspaceMock: vi.fn(),
  graceThresholdMsMock: vi.fn().mockReturnValue(1000),
  deleteMock: vi.fn().mockResolvedValue(undefined),
  deleteWorkspaceIndexMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    maintenance: {
      selectPurgeableWorkspaces: selectPurgeableWorkspacesMock,
      revalidateWorkspaceForPurge: revalidateWorkspaceForPurgeMock,
      cascadeDeleteWorkspace: cascadeDeleteWorkspaceMock,
      graceThresholdMs: graceThresholdMsMock,
    },
  };
});

vi.mock('../../environment.js', () => ({
  getEnvironment: () => ({
    WORKSPACE_DELETE_GRACE_PERIOD_DAYS: 30,
    MAINTENANCE_PURGE_BATCH_SIZE: 100,
  }),
}));

vi.mock('../../storage-context.js', () => ({
  getStorageAdapter: () => ({ delete: deleteMock }),
}));

vi.mock('../../search/search-context.js', () => ({
  getSearchService: () => ({ deleteWorkspaceIndex: deleteWorkspaceIndexMock }),
}));

function makeContext(
  payload: MaintenancePurgeWorkspacesPayloadV1,
  overrides?: Partial<JobExecutionContext<MaintenancePurgeWorkspacesPayloadV1>>
): JobExecutionContext<MaintenancePurgeWorkspacesPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'maintenance.purge-workspaces',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 3,
    signal: new AbortController().signal,
    now: () => new Date('2024-01-01T00:00:00.000Z'),
    enqueueChild: vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' }),
    ...overrides,
  };
}

describe('maintenance.purge-workspaces handler', () => {
  beforeEach(() => {
    selectPurgeableWorkspacesMock.mockReset();
    revalidateWorkspaceForPurgeMock.mockReset();
    cascadeDeleteWorkspaceMock.mockReset();
    deleteMock.mockClear();
    deleteWorkspaceIndexMock.mockReset();
  });

  test('purges every candidate in the batch and reports counts without continuation', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({ candidates: [{ id: 'ws-1' }, { id: 'ws-2' }], totalEligible: 2 });
    revalidateWorkspaceForPurgeMock.mockResolvedValue({ id: 'ws-1' });
    cascadeDeleteWorkspaceMock.mockResolvedValue({});

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(deleteWorkspaceIndexMock).toHaveBeenCalledTimes(2);
    expect(cascadeDeleteWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scanned: 2, purged: 2, skipped: 0, hasMoreWork: false });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('skips and retries later when deleting the workspace search index fails', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({ candidates: [{ id: 'ws-1' }], totalEligible: 1 });
    revalidateWorkspaceForPurgeMock.mockResolvedValue({ id: 'ws-1' });
    deleteWorkspaceIndexMock.mockRejectedValue(new Error('boom'));

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(cascadeDeleteWorkspaceMock).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, purged: 0, skipped: 1, hasMoreWork: false });
  });

  test('enqueues a continuation advancing the offset only by skipped candidates', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }, { id: 'ws-2' }, { id: 'ws-3' }],
      totalEligible: 10,
    });
    revalidateWorkspaceForPurgeMock
      .mockResolvedValueOnce({ id: 'ws-1' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'ws-3' });
    cascadeDeleteWorkspaceMock.mockResolvedValue({});

    const context = makeContext({ offset: 0 });
    await maintenancePurgeWorkspacesJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { offset: 1 },
      })
    );
  });

  test('stops before purging the next candidate once the abort signal fires', async () => {
    const controller = new AbortController();
    selectPurgeableWorkspacesMock.mockResolvedValue({ candidates: [{ id: 'ws-1' }, { id: 'ws-2' }], totalEligible: 2 });
    revalidateWorkspaceForPurgeMock.mockImplementation(async () => {
      controller.abort();
      return { id: 'ws-1' };
    });
    cascadeDeleteWorkspaceMock.mockResolvedValue({});

    const context = makeContext({ offset: 0 }, { signal: controller.signal });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(cascadeDeleteWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(result.hasMoreWork).toBe(false);
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });
});
