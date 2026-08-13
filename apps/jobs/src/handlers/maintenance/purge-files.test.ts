import { describe, test, expect, vi, beforeEach } from 'vitest';
import { maintenancePurgeFilesJobDefinition, type MaintenancePurgeFilesResult } from './purge-files.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { MaintenancePurgeFilesPayloadV1 } from '@thoth/job-protocol';

const {
  pruneDanglingFileUsagesMock,
  selectOrphanFileCandidatesMock,
  purgeOrphanFileMock,
  graceThresholdMsFromHoursMock,
  deleteMock,
} = vi.hoisted(() => ({
  pruneDanglingFileUsagesMock: vi.fn(),
  selectOrphanFileCandidatesMock: vi.fn(),
  purgeOrphanFileMock: vi.fn(),
  graceThresholdMsFromHoursMock: vi.fn().mockReturnValue(1000),
  deleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    maintenance: {
      pruneDanglingFileUsages: pruneDanglingFileUsagesMock,
      selectOrphanFileCandidates: selectOrphanFileCandidatesMock,
      purgeOrphanFile: purgeOrphanFileMock,
      graceThresholdMsFromHours: graceThresholdMsFromHoursMock,
    },
  };
});

vi.mock('../../environment.js', () => ({
  getEnvironment: () => ({
    FILES_PURGE_GRACE_PERIOD_HOURS: 24,
    MAINTENANCE_PURGE_BATCH_SIZE: 100,
  }),
}));

vi.mock('../../storage-context.js', () => ({
  getStorageAdapter: () => ({ delete: deleteMock }),
}));

function makeContext(
  payload: MaintenancePurgeFilesPayloadV1,
  overrides?: Partial<JobExecutionContext<MaintenancePurgeFilesPayloadV1>>
): JobExecutionContext<MaintenancePurgeFilesPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'maintenance.purge-files',
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

describe('maintenance.purge-files handler', () => {
  beforeEach(() => {
    pruneDanglingFileUsagesMock.mockReset().mockResolvedValue({ prunedCount: 0, liveFileIds: new Set() });
    selectOrphanFileCandidatesMock.mockReset();
    purgeOrphanFileMock.mockReset();
    deleteMock.mockClear();
  });

  test('prunes dangling usages once and reports counts for a fully-purged batch', async () => {
    pruneDanglingFileUsagesMock.mockResolvedValue({ prunedCount: 3, liveFileIds: new Set(['live-1']) });
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [
        { id: 'file-1', storageKey: 'key-1' },
        { id: 'file-2', storageKey: 'key-2' },
      ],
      totalEligible: 2,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'purged' });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(pruneDanglingFileUsagesMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      scanned: 2,
      purged: 2,
      skipped: 0,
      retryLater: 0,
      danglingUsagesPruned: 3,
      hasMoreWork: false,
    });
  });

  test('keeps the DB row and counts retryLater on a storage-delete failure', async () => {
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [{ id: 'file-1', storageKey: 'key-1' }],
      totalEligible: 1,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'retry-later', reason: 'storage-delete-failed' });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(result.retryLater).toBe(1);
    expect(result.purged).toBe(0);
  });

  test('skips a candidate that regained a live usage in the immediate re-check', async () => {
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [{ id: 'file-1', storageKey: 'key-1' }],
      totalEligible: 1,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'skipped', reason: 'now-referenced' });

    const context = makeContext({ offset: 0 });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(result.skipped).toBe(1);
    expect(result.purged).toBe(0);
  });

  test('advances the offset only by retryLater candidates, not purged or skipped ones', async () => {
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [{ id: 'file-1', storageKey: 'key-1' }],
      totalEligible: 5,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'retry-later', reason: 'storage-delete-failed' });

    const context = makeContext({ offset: 2 });
    await maintenancePurgeFilesJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance.purge-files',
        payload: { offset: 3 },
        dedupeKey: 'maintenance:purge-files',
      })
    );
  });

  test('leaves the offset unchanged when the batch is fully purged (purged files leave the eligible set)', async () => {
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [{ id: 'file-1', storageKey: 'key-1' }],
      totalEligible: 5,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'purged' });

    const context = makeContext({ offset: 2 });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(result.hasMoreWork).toBe(true);
    expect(context.enqueueChild).toHaveBeenCalledWith(expect.objectContaining({ payload: { offset: 2 } }));
  });

  test('leaves the offset unchanged when the batch is fully skipped (now-referenced files leave the eligible set)', async () => {
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [{ id: 'file-1', storageKey: 'key-1' }],
      totalEligible: 5,
    });
    purgeOrphanFileMock.mockResolvedValue({ status: 'skipped', reason: 'now-referenced' });

    const context = makeContext({ offset: 2 });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(result.hasMoreWork).toBe(true);
    expect(context.enqueueChild).toHaveBeenCalledWith(expect.objectContaining({ payload: { offset: 2 } }));
  });

  test('returns an empty result and never prunes dangling usages when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const context = makeContext({ offset: 0 }, { signal: controller.signal });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(pruneDanglingFileUsagesMock).not.toHaveBeenCalled();
    expect(selectOrphanFileCandidatesMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 0,
      purged: 0,
      skipped: 0,
      retryLater: 0,
      danglingUsagesPruned: 0,
      hasMoreWork: false,
    });
  });

  test('stops before the next candidate once the abort signal fires', async () => {
    const controller = new AbortController();
    selectOrphanFileCandidatesMock.mockResolvedValue({
      candidates: [
        { id: 'file-1', storageKey: 'key-1' },
        { id: 'file-2', storageKey: 'key-2' },
      ],
      totalEligible: 2,
    });
    purgeOrphanFileMock.mockImplementation(async () => {
      controller.abort();
      return { status: 'purged' };
    });

    const context = makeContext({ offset: 0 }, { signal: controller.signal });
    const result = (await maintenancePurgeFilesJobDefinition.handler(context)) as MaintenancePurgeFilesResult;

    expect(purgeOrphanFileMock).toHaveBeenCalledTimes(1);
    expect(result.hasMoreWork).toBe(false);
  });
});
