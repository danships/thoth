import { describe, test, expect, vi, beforeEach } from 'vitest';
import { historyMaintainJobDefinition } from './maintain.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { HistoryMaintainPayloadV1 } from '@thoth/job-protocol';

const { maintainPageHistoryMock } = vi.hoisted(() => ({
  maintainPageHistoryMock: vi.fn(),
}));

vi.mock('@thoth/database', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, maintainPageHistory: maintainPageHistoryMock };
});

function makeContext(
  payload: HistoryMaintainPayloadV1,
  overrides?: Partial<JobExecutionContext<HistoryMaintainPayloadV1>>
): JobExecutionContext<HistoryMaintainPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'history.maintain',
    payloadVersion: 1,
    payload,
    attempt: 1,
    maxAttempts: 5,
    signal: new AbortController().signal,
    now: () => new Date('2024-01-01T00:00:00.000Z'),
    enqueueChild: vi.fn().mockResolvedValue({ jobId: 'child-1', disposition: 'created' }),
    ...overrides,
  };
}

describe('history.maintain handler', () => {
  beforeEach(() => {
    maintainPageHistoryMock.mockReset();
  });

  test('reports a no-op outcome without enqueueing a continuation', async () => {
    maintainPageHistoryMock.mockResolvedValue({ status: 'no-op' });

    const context = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    const result = await historyMaintainJobDefinition.handler(context);

    expect(result).toEqual({ streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: false });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('reports stale without enqueueing a continuation when a save landed mid-flight', async () => {
    maintainPageHistoryMock.mockResolvedValue({ status: 'stale' });

    const context = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    const result = await historyMaintainJobDefinition.handler(context);

    expect(result).toEqual({ streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: true });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('maps a completed outcome to counts and enqueues a same-key continuation when more work remains', async () => {
    maintainPageHistoryMock.mockResolvedValue({
      status: 'completed',
      streamsInspected: 2,
      runsConsolidated: 3,
      rowsPruned: 10,
      malformedStreams: [],
      hasMoreWork: true,
    });

    const context = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    const result = await historyMaintainJobDefinition.handler(context);

    expect(result).toEqual({ streamsInspected: 2, runsConsolidated: 3, rowsPruned: 10, stale: false });
    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history.maintain',
        payload: { workspaceId: 'ws-1', containerId: 'page-1' },
        dedupeKey: 'history:ws-1:page-1',
      })
    );
  });

  test('does not enqueue a continuation when no more work remains', async () => {
    maintainPageHistoryMock.mockResolvedValue({
      status: 'completed',
      streamsInspected: 1,
      runsConsolidated: 1,
      rowsPruned: 0,
      malformedStreams: [],
      hasMoreWork: false,
    });

    const context = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    await historyMaintainJobDefinition.handler(context);

    expect(context.enqueueChild).not.toHaveBeenCalled();
  });

  test('stops before mutating when the lease/abort signal is already lost', async () => {
    const controller = new AbortController();
    controller.abort();

    const context = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' }, { signal: controller.signal });
    const result = await historyMaintainJobDefinition.handler(context);

    expect(result).toEqual({ streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: true });
    expect(maintainPageHistoryMock).not.toHaveBeenCalled();
  });

  test('serialises concurrent executions for the same (workspaceId, containerId) key', async () => {
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    maintainPageHistoryMock.mockImplementation(async () => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCalls -= 1;
      return { status: 'no-op' };
    });

    const contextA = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    const contextB = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });

    await Promise.all([
      historyMaintainJobDefinition.handler(contextA),
      historyMaintainJobDefinition.handler(contextB),
    ]);

    expect(maxConcurrentCalls).toBe(1);
  });

  test('does not serialise executions for different pages', async () => {
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    maintainPageHistoryMock.mockImplementation(async () => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrentCalls -= 1;
      return { status: 'no-op' };
    });

    const contextA = makeContext({ workspaceId: 'ws-1', containerId: 'page-1' });
    const contextB = makeContext({ workspaceId: 'ws-1', containerId: 'page-2' });

    await Promise.all([
      historyMaintainJobDefinition.handler(contextA),
      historyMaintainJobDefinition.handler(contextB),
    ]);

    expect(maxConcurrentCalls).toBe(2);
  });
});
