import { fetchPageRevisionScanBatch } from '@thoth/database';
import {
  historyScanPayloadV1Schema,
  historyMaintainDedupeKey,
  type HistoryScanPayloadV1,
  type JobDefinition,
  type JobExecutionContext,
} from '@thoth/job-protocol';

const HISTORY_SCAN_MAX_ATTEMPTS = 3;
// Priority: below webhook delivery (10) but above `history.maintain` itself — discovery must
// keep making forward progress (advancing its cursor) even while individual page maintenance
// jobs it fans out are still queued/running.
const HISTORY_SCAN_PRIORITY = 6;

// Bounded batch size per execution — keeps one scan tick's DB read and lease time small
// regardless of total history estate size; a continuation picks up where this batch left off.
const SCAN_BATCH_SIZE = 200;

export type HistoryScanResult = {
  rowsScanned: number;
  pagesEnqueued: number;
  continued: boolean;
};

/**
 * `history.scan` — hourly discovery job (THOTH-062). Fetches one bounded, `(createdAt, id)`
 * cursor-paginated batch of `page-revision` rows, collects the distinct `(workspaceId,
 * containerId)` pairs it saw, and enqueues one deduped `history.maintain` job per pair
 * (`history:<workspaceId>:<containerId>` — boundary duplicates across scan batches are
 * harmless, maintain dedupe absorbs them). Enqueues a same-type cursor continuation when another
 * batch remains, so a huge `page-revision` table is discovered incrementally rather than in one
 * unbounded pass. Defensively refuses to loop forever if the cursor ever fails to advance.
 */
export const historyScanJobDefinition: JobDefinition<HistoryScanPayloadV1> = {
  type: 'history.scan',
  payloadVersion: 1,
  payloadSchema: historyScanPayloadV1Schema,
  priority: HISTORY_SCAN_PRIORITY,
  maxAttempts: HISTORY_SCAN_MAX_ATTEMPTS,
  handler: async (context: JobExecutionContext<HistoryScanPayloadV1>): Promise<HistoryScanResult> => {
    const { cursor } = context.payload;

    const batch = await fetchPageRevisionScanBatch(cursor, SCAN_BATCH_SIZE);

    const distinctPages = new Map<string, { workspaceId: string; containerId: string }>();
    for (const row of batch.rows) {
      distinctPages.set(`${row.workspaceId}:${row.containerId}`, {
        workspaceId: row.workspaceId,
        containerId: row.containerId,
      });
    }

    let pagesEnqueued = 0;
    for (const page of distinctPages.values()) {
      await context.enqueueChild({
        type: 'history.maintain',
        payloadVersion: 1,
        payload: page,
        dedupeKey: historyMaintainDedupeKey(page),
      });
      pagesEnqueued += 1;
    }

    let continued = false;
    if (batch.nextCursor) {
      // Cursor must always advance — a repeated cursor would otherwise loop this scan forever.
      if (cursor && batch.nextCursor.createdAt === cursor.createdAt && batch.nextCursor.id === cursor.id) {
        throw new Error('history.scan: cursor failed to advance');
      }

      await context.enqueueChild({
        type: 'history.scan',
        payloadVersion: 1,
        payload: { cursor: batch.nextCursor },
      });
      continued = true;
    }

    return { rowsScanned: batch.rows.length, pagesEnqueued, continued };
  },
};
