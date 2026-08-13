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

  test('enqueues a continuation with the advanced offset when more work remains', async () => {
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
        payload: { offset: 1 },
        dedupeKey: 'maintenance:purge-workspaces',
      })
    );
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
