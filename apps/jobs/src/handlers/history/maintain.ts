import { maintainPageHistory } from '@thoth/database';
import {
  historyMaintainPayloadV1Schema,
  historyMaintainDedupeKey,
  type HistoryMaintainPayloadV1,
  type JobDefinition,
  type JobExecutionContext,
} from '@thoth/job-protocol';
import { KeyedLock } from './lock.js';

const HISTORY_MAINTAIN_MAX_ATTEMPTS = 5;
// Priority: below webhook delivery (10) — history maintenance is best-effort background
// housekeeping, never allowed to starve out user-triggered webhook work.
const HISTORY_MAINTAIN_PRIORITY = 5;

// Bounds concurrent executions racing the same page inside this one worker process; queue
// dedupe already prevents two *queued* jobs for the same key, this additionally protects
// continuation/crash-recovery re-entry (see `./lock.ts`).
const maintenanceLock = new KeyedLock();

export type HistoryMaintainResult = {
  streamsInspected: number;
  runsConsolidated: number;
  rowsPruned: number;
  stale: boolean;
};

/**
 * `history.maintain` — thin orchestrator around `@thoth/database`'s `maintainPageHistory`
 * (THOTH-062). Runs at most one bounded maintenance pass per invocation; if more sealed runs or
 * excess rows remain, enqueues a same-dedupe-key continuation so a huge single page's history
 * never monopolises a worker slot across one execution. A `stale` outcome (a save landed
 * mid-flight) is reported, never retried immediately — the next hourly `history.scan` will
 * naturally revisit the page.
 */
export const historyMaintainJobDefinition: JobDefinition<HistoryMaintainPayloadV1> = {
  type: 'history.maintain',
  payloadVersion: 1,
  payloadSchema: historyMaintainPayloadV1Schema,
  priority: HISTORY_MAINTAIN_PRIORITY,
  maxAttempts: HISTORY_MAINTAIN_MAX_ATTEMPTS,
  dedupeKey: historyMaintainDedupeKey,
  handler: async (context: JobExecutionContext<HistoryMaintainPayloadV1>): Promise<HistoryMaintainResult> => {
    const { workspaceId, containerId } = context.payload;
    const lockKey = `${workspaceId}:${containerId}`;

    return maintenanceLock.withLock(lockKey, async () => {
      // Lease/abort revalidation: if the runner has already lost ownership (signal aborted)
      // before we even start, stop before touching anything.
      if (context.signal.aborted) {
        return { streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: true };
      }

      const outcome = await maintainPageHistory({ workspaceId, containerId, now: context.now });

      if (outcome.status === 'no-op') {
        return { streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: false };
      }

      if (outcome.status === 'stale') {
        return { streamsInspected: 0, runsConsolidated: 0, rowsPruned: 0, stale: true };
      }

      if (outcome.hasMoreWork && !context.signal.aborted) {
        await context.enqueueChild({
          type: 'history.maintain',
          payloadVersion: 1,
          payload: { workspaceId, containerId },
          dedupeKey: historyMaintainDedupeKey({ workspaceId, containerId }),
        });
      }

      return {
        streamsInspected: outcome.streamsInspected,
        runsConsolidated: outcome.runsConsolidated,
        rowsPruned: outcome.rowsPruned,
        stale: false,
      };
    });
  },
};
