import { describe, test, expect, vi } from 'vitest';
import { historyScanJobDefinition } from './scan.js';
import type { JobExecutionContext } from '@thoth/job-protocol';
import type { HistoryScanPayloadV1 } from '@thoth/job-protocol';

const { fetchPageRevisionScanBatchMock } = vi.hoisted(() => ({
  fetchPageRevisionScanBatchMock: vi.fn(),
}));

vi.mock('./scan-query.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchPageRevisionScanBatch: fetchPageRevisionScanBatchMock };
});

function makeContext(
  payload: HistoryScanPayloadV1,
  overrides?: Partial<JobExecutionContext<HistoryScanPayloadV1>>
): JobExecutionContext<HistoryScanPayloadV1> {
  return {
    jobId: 'job-1',
    type: 'history.scan',
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

describe('history.scan handler', () => {
  test('enqueues one deduped history.maintain per distinct (workspaceId, containerId) pair', async () => {
    fetchPageRevisionScanBatchMock.mockResolvedValue({
      rows: [
        { workspaceId: 'ws-1', containerId: 'page-1', createdAt: '2024-01-01T00:00:00.000Z', id: 'rev-1' },
        { workspaceId: 'ws-1', containerId: 'page-1', createdAt: '2024-01-01T00:00:01.000Z', id: 'rev-2' },
        { workspaceId: 'ws-1', containerId: 'page-2', createdAt: '2024-01-01T00:00:02.000Z', id: 'rev-3' },
      ],
      nextCursor: undefined,
    });

    const context = makeContext({});
    const result = await historyScanJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledTimes(2);
    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history.maintain',
        payload: { workspaceId: 'ws-1', containerId: 'page-1' },
        dedupeKey: 'history:ws-1:page-1',
      })
    );
    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'history.maintain',
        payload: { workspaceId: 'ws-1', containerId: 'page-2' },
        dedupeKey: 'history:ws-1:page-2',
      })
    );
    expect(result).toEqual({ rowsScanned: 3, pagesEnqueued: 2, continued: false });
  });

  test('enqueues a cursor continuation when another batch remains', async () => {
    const nextCursor = { createdAt: '2024-01-02T00:00:00.000Z', id: 'rev-9' };
    fetchPageRevisionScanBatchMock.mockResolvedValue({
      rows: [{ workspaceId: 'ws-1', containerId: 'page-1', createdAt: '2024-01-01T00:00:00.000Z', id: 'rev-1' }],
      nextCursor,
    });

    const context = makeContext({});
    const result = await historyScanJobDefinition.handler(context);

    expect(context.enqueueChild).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'history.scan', payload: { cursor: nextCursor } })
    );
    expect(result).toEqual({ rowsScanned: 1, pagesEnqueued: 1, continued: true });
  });

  test('boundary duplicates across batches are harmless: dedupe key is identical either way', async () => {
    fetchPageRevisionScanBatchMock.mockResolvedValue({
      rows: [
        { workspaceId: 'ws-1', containerId: 'page-1', createdAt: '2024-01-01T00:00:00.000Z', id: 'rev-1' },
        { workspaceId: 'ws-1', containerId: 'page-1', createdAt: '2024-01-01T00:00:00.000Z', id: 'rev-1' },
      ],
      nextCursor: undefined,
    });

    const context = makeContext({});
    const result = (await historyScanJobDefinition.handler(context)) as { pagesEnqueued: number };

    expect(result.pagesEnqueued).toBe(1);
  });

  test('throws a defensive error rather than looping forever if the cursor fails to advance', async () => {
    const cursor = { createdAt: '2024-01-01T00:00:00.000Z', id: 'rev-1' };
    fetchPageRevisionScanBatchMock.mockResolvedValue({
      rows: [],
      nextCursor: cursor,
    });

    const context = makeContext({ cursor });

    await expect(historyScanJobDefinition.handler(context)).rejects.toThrow(/cursor failed to advance/);
  });

  test('empty batch with no next cursor is a clean terminal completion', async () => {
    fetchPageRevisionScanBatchMock.mockResolvedValue({ rows: [], nextCursor: undefined });

    const context = makeContext({});
    const result = await historyScanJobDefinition.handler(context);

    expect(result).toEqual({ rowsScanned: 0, pagesEnqueued: 0, continued: false });
    expect(context.enqueueChild).not.toHaveBeenCalled();
  });
});
