import { describe, test, expect, vi, beforeEach } from 'vitest';
import { maintenancePruneJobsJobDefinition, type MaintenancePruneJobsResult } from './prune-jobs.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { MaintenancePruneJobsPayloadV1 } from '@thoth/job-protocol';

const { pruneTerminalByPolicyMock } = vi.hoisted(() => ({
  pruneTerminalByPolicyMock: vi.fn(),
}));

vi.mock('../../queue/queue-context.js', () => ({
  getQueueService: () => ({ pruneTerminalByPolicy: pruneTerminalByPolicyMock }),
}));

vi.mock('../../environment.js', () => ({
  getEnvironment: () => ({
    JOB_COMPLETED_RETENTION_DAYS: 7,
    JOB_DEAD_RETENTION_DAYS: 30,
  }),
}));

function makeContext(
  payload: MaintenancePruneJobsPayloadV1,
  overrides?: Partial<JobExecutionContext<MaintenancePruneJobsPayloadV1>>
): JobExecutionContext<MaintenancePruneJobsPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'maintenance.prune-jobs',
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

describe('maintenance.prune-jobs handler', () => {
  beforeEach(() => {
    pruneTerminalByPolicyMock.mockReset();
  });

  test('reports the pruned count and no continuation when the batch covers everything eligible', async () => {
    pruneTerminalByPolicyMock.mockResolvedValue({ ids: ['job-a', 'job-b'], totalEligible: 2 });

    const context = makeContext({});
    const result = (await maintenancePruneJobsJobDefinition.handler(context)) as MaintenancePruneJobsResult;

    expect(result).toEqual({ pruned: 2, hasMoreWork: false });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('enqueues a continuation when more terminal rows remain than the batch size', async () => {
    pruneTerminalByPolicyMock.mockResolvedValue({ ids: ['job-a'], totalEligible: 500 });

    const context = makeContext({});
    const result = (await maintenancePruneJobsJobDefinition.handler(context)) as MaintenancePruneJobsResult;

    expect(result.hasMoreWork).toBe(true);
    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'maintenance.prune-jobs',
        payload: {},
        dedupeKey: 'maintenance:prune-jobs',
      })
    );
  });

  test('never enqueues a continuation once the abort signal fires', async () => {
    const controller = new AbortController();
    controller.abort();
    pruneTerminalByPolicyMock.mockResolvedValue({ ids: ['job-a'], totalEligible: 500 });

    const context = makeContext({}, { signal: controller.signal });
    const result = (await maintenancePruneJobsJobDefinition.handler(context)) as MaintenancePruneJobsResult;

    expect(result.hasMoreWork).toBe(false);
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });
});
