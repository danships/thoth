import { describe, test, expect, vi, beforeEach } from 'vitest';
import { maintenancePurgeWorkspacesJobDefinition, type MaintenancePurgeWorkspacesResult } from './purge-workspaces.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { MaintenancePurgeWorkspacesPayloadV1 } from '@thoth/job-protocol';

const {
  selectPurgeableWorkspacesMock,
  purgeWorkspaceMock,
  graceThresholdMsMock,
  deleteMock,
} = vi.hoisted(() => ({
  selectPurgeableWorkspacesMock: vi.fn(),
  purgeWorkspaceMock: vi.fn(),
  graceThresholdMsMock: vi.fn().mockReturnValue(1000),
  deleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    maintenance: {
      selectPurgeableWorkspaces: selectPurgeableWorkspacesMock,
      purgeWorkspace: purgeWorkspaceMock,
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
    purgeWorkspaceMock.mockReset();
    deleteMock.mockClear();
  });

  test('purges every candidate in the batch and reports counts without continuation', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }, { id: 'ws-2' }],
      totalEligible: 2,
    });
    purgeWorkspaceMock.mockResolvedValue({ status: 'purged', counts: {} });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(purgeWorkspaceMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ scanned: 2, purged: 2, skipped: 0, hasMoreWork: false });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('enqueues a continuation with offset unchanged when the whole batch was purged (purged rows leave the eligible set)', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }],
      totalEligible: 5,
    });
    purgeWorkspaceMock.mockResolvedValue({ status: 'purged', counts: {} });

    const context = makeContext({ offset: 0 });
    await maintenancePurgeWorkspacesJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance.purge-workspaces',
        payload: { offset: 0 },
        dedupeKey: 'maintenance:purge-workspaces',
      })
    );
  });

  test('enqueues a continuation advancing the offset only by skipped candidates, not purged ones', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }, { id: 'ws-2' }, { id: 'ws-3' }],
      totalEligible: 10,
    });
    purgeWorkspaceMock
      .mockResolvedValueOnce({ status: 'purged', counts: {} })
      .mockResolvedValueOnce({ status: 'skipped', reason: 'restored' })
      .mockResolvedValueOnce({ status: 'purged', counts: {} });

    const context = makeContext({ offset: 0 });
    await maintenancePurgeWorkspacesJobDefinition.handler(context);

    // Only the single skipped candidate remains in the eligible set at its original position —
    // the two purged ones are gone, so the offset must not skip over unseen rows behind them.
    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { offset: 1 },
      })
    );
  });

  test('does not treat a fresh, fully-purged batch as reaching the end of a much larger eligible set', async () => {
    // Regression case: 200 eligible workspaces, a 100-sized batch fully purged. The next
    // continuation must still see `hasMoreWork: true` with `offset: 0` (not `offset: 100`,
    // which would incorrectly skip the remaining 100 rows once they shift down to fill the
    // gap left by this batch).
    const candidates = Array.from({ length: 100 }, (_, index) => ({ id: `ws-${index}` }));
    selectPurgeableWorkspacesMock.mockResolvedValue({ candidates, totalEligible: 200 });
    purgeWorkspaceMock.mockResolvedValue({ status: 'purged', counts: {} });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(result.hasMoreWork).toBe(true);
    expect(context.enqueueChild).toHaveBeenCalledWith(expect.objectContaining({ payload: { offset: 0 } }));
  });

  test('stops before purging the next candidate once the abort signal fires', async () => {
    const controller = new AbortController();
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }, { id: 'ws-2' }],
      totalEligible: 2,
    });
    purgeWorkspaceMock.mockImplementation(async () => {
      controller.abort();
      return { status: 'purged', counts: {} };
    });

    const context = makeContext({ offset: 0 }, { signal: controller.signal });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(purgeWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(result.hasMoreWork).toBe(false);
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('counts a skipped (revalidation-failed) candidate without treating it as purged', async () => {
    selectPurgeableWorkspacesMock.mockResolvedValue({
      candidates: [{ id: 'ws-1' }],
      totalEligible: 1,
    });
    purgeWorkspaceMock.mockResolvedValue({ status: 'skipped', reason: 'restored' });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeWorkspacesJobDefinition.handler(context)) as MaintenancePurgeWorkspacesResult;

    expect(result).toEqual({ scanned: 1, purged: 0, skipped: 1, hasMoreWork: false });
  });
});
