import { describe, test, expect, vi, beforeEach } from 'vitest';
import { maintenancePurgePagesJobDefinition, type MaintenancePurgePagesResult } from './purge-pages.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { MaintenancePurgePagesPayloadV1 } from '@thoth/job-protocol';

const { selectPurgeableDeletedRootsMock, permanentlyDeleteDeletedRootMock, graceThresholdMsMock } = vi.hoisted(() => ({
  selectPurgeableDeletedRootsMock: vi.fn(),
  permanentlyDeleteDeletedRootMock: vi.fn(),
  graceThresholdMsMock: vi.fn().mockReturnValue(1000),
}));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    maintenance: {
      selectPurgeableDeletedRoots: selectPurgeableDeletedRootsMock,
      permanentlyDeleteDeletedRoot: permanentlyDeleteDeletedRootMock,
      graceThresholdMs: graceThresholdMsMock,
    },
  };
});

vi.mock('../../environment.js', () => ({
  getEnvironment: () => ({
    PAGE_DELETE_GRACE_PERIOD_DAYS: 30,
    MAINTENANCE_PURGE_BATCH_SIZE: 100,
  }),
}));

function makeContext(
  payload: MaintenancePurgePagesPayloadV1,
  overrides?: Partial<JobExecutionContext<MaintenancePurgePagesPayloadV1>>
): JobExecutionContext<MaintenancePurgePagesPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'maintenance.purge-pages',
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

describe('maintenance.purge-pages handler', () => {
  beforeEach(() => {
    selectPurgeableDeletedRootsMock.mockReset();
    permanentlyDeleteDeletedRootMock.mockReset();
  });

  test('purges every candidate root scoped by workspace id, not creator', async () => {
    selectPurgeableDeletedRootsMock.mockResolvedValue({
      candidates: [
        { id: 'root-1', workspaceId: 'ws-1', kind: 'container' },
        { id: 'root-2', workspaceId: 'ws-1', kind: 'data-view' },
      ],
      totalEligible: 2,
    });
    permanentlyDeleteDeletedRootMock.mockResolvedValue({
      status: 'purged',
      deletedContainerIds: ['root-1'],
      deletedViewIds: [],
    });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgePagesJobDefinition.handler(context)) as MaintenancePurgePagesResult;

    expect(permanentlyDeleteDeletedRootMock).toHaveBeenCalledWith('root-1', 'ws-1', 1000);
    expect(permanentlyDeleteDeletedRootMock).toHaveBeenCalledWith('root-2', 'ws-1', 1000);
    expect(result).toEqual({ scanned: 2, purged: 2, skipped: 0, hasMoreWork: false });
  });

  test('enqueues a continuation with offset unchanged when the purged candidate leaves the eligible set', async () => {
    selectPurgeableDeletedRootsMock.mockResolvedValue({
      candidates: [{ id: 'root-1', workspaceId: 'ws-1', kind: 'container' }],
      totalEligible: 10,
    });
    permanentlyDeleteDeletedRootMock.mockResolvedValue({
      status: 'purged',
      deletedContainerIds: [],
      deletedViewIds: [],
    });

    const context = makeContext({ offset: 3 });
    await maintenancePurgePagesJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance.purge-pages',
        payload: { offset: 3 },
        dedupeKey: 'maintenance:purge-pages',
      })
    );
  });

  test('enqueues a continuation advancing the offset only by skipped candidates, not purged ones', async () => {
    selectPurgeableDeletedRootsMock.mockResolvedValue({
      candidates: [
        { id: 'root-1', workspaceId: 'ws-1', kind: 'container' },
        { id: 'root-2', workspaceId: 'ws-1', kind: 'data-view' },
      ],
      totalEligible: 10,
    });
    permanentlyDeleteDeletedRootMock
      .mockResolvedValueOnce({ status: 'skipped', reason: 'restored-or-missing' })
      .mockResolvedValueOnce({ status: 'purged', deletedContainerIds: [], deletedViewIds: ['root-2'] });

    const context = makeContext({ offset: 0 });
    await maintenancePurgePagesJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(expect.objectContaining({ payload: { offset: 1 } }));
  });

  test('does not treat a fresh, fully-purged batch as reaching the end of a much larger eligible set', async () => {
    // Regression case: 200 eligible deleted roots, a 100-sized batch fully purged. The next
    // continuation must still see `hasMoreWork: true` with the offset unchanged (not advanced by
    // 100, which would incorrectly skip the remaining 100 rows once they shift down to fill the
    // gap left by this batch).
    const candidates = Array.from({ length: 100 }, (_, index) => ({
      id: `root-${index}`,
      workspaceId: 'ws-1',
      kind: 'container' as const,
    }));
    selectPurgeableDeletedRootsMock.mockResolvedValue({ candidates, totalEligible: 200 });
    permanentlyDeleteDeletedRootMock.mockResolvedValue({
      status: 'purged',
      deletedContainerIds: [],
      deletedViewIds: [],
    });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgePagesJobDefinition.handler(context)) as MaintenancePurgePagesResult;

    expect(result.hasMoreWork).toBe(true);
    expect(context.enqueueChild).toHaveBeenCalledWith(expect.objectContaining({ payload: { offset: 0 } }));
  });

  test('stops before the next candidate once the abort signal fires', async () => {
    const controller = new AbortController();
    selectPurgeableDeletedRootsMock.mockResolvedValue({
      candidates: [
        { id: 'root-1', workspaceId: 'ws-1', kind: 'container' },
        { id: 'root-2', workspaceId: 'ws-1', kind: 'container' },
      ],
      totalEligible: 2,
    });
    permanentlyDeleteDeletedRootMock.mockImplementation(async () => {
      controller.abort();
      return { status: 'purged', deletedContainerIds: [], deletedViewIds: [] };
    });

    const context = makeContext({ offset: 0 }, { signal: controller.signal });
    const result = (await maintenancePurgePagesJobDefinition.handler(context)) as MaintenancePurgePagesResult;

    expect(permanentlyDeleteDeletedRootMock).toHaveBeenCalledTimes(1);
    expect(context.enqueueChild).not.toHaveBeenCalled();
    expect(result.hasMoreWork).toBe(false);
  });
});
