import { maintenance } from '@thoth/database';
import {
  maintenancePurgePagesPayloadV1Schema,
  maintenancePurgePagesDedupeKey,
  type JobDefinition,
  type JobExecutionContext,
  type MaintenancePurgePagesPayloadV1,
} from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { getLogger } from '../../logger.js';

const MAINTENANCE_PURGE_PAGES_PRIORITY = 2;
const MAINTENANCE_PURGE_PAGES_MAX_ATTEMPTS = 3;

export type MaintenancePurgePagesResult = {
  scanned: number;
  purged: number;
  skipped: number;
  hasMoreWork: boolean;
};

/**
 * `maintenance.purge-pages` — permanently deletes soft-deleted page/data-source/data-view roots
 * (`deletedRootId === id`) whose grace period has expired, converting the former
 * `scripts/purge-deleted-pages.ts` cron script into a bounded, restart-safe job handler
 * (THOTH-063). Scoped by workspace/root id only — never by creator `userId` (THOTH-042). See
 * `maintenance.purge-workspaces` (`./purge-workspaces.ts`) for the shared bounded/continuation
 * design this mirrors.
 */
export const maintenancePurgePagesJobDefinition: JobDefinition<MaintenancePurgePagesPayloadV1> = {
  type: 'maintenance.purge-pages',
  payloadVersion: 1,
  payloadSchema: maintenancePurgePagesPayloadV1Schema,
  priority: MAINTENANCE_PURGE_PAGES_PRIORITY,
  maxAttempts: MAINTENANCE_PURGE_PAGES_MAX_ATTEMPTS,
  dedupeKey: maintenancePurgePagesDedupeKey,
  handler: async (
    context: JobExecutionContext<MaintenancePurgePagesPayloadV1>
  ): Promise<MaintenancePurgePagesResult> => {
    const environment = getEnvironment();
    const logger = getLogger();

    const now = context.now();
    const graceThresholdMs = maintenance.graceThresholdMs(now.getTime(), environment.PAGE_DELETE_GRACE_PERIOD_DAYS);

    const batch = await maintenance.selectPurgeableDeletedRoots({
      graceThresholdMs,
      nowMs: now.getTime(),
      limit: environment.MAINTENANCE_PURGE_BATCH_SIZE,
      offset: context.payload.offset,
    });

    let purged = 0;
    let skipped = 0;

    for (const candidate of batch.candidates) {
      if (context.signal.aborted) {
        break;
      }

      const outcome = await maintenance.permanentlyDeleteDeletedRoot(candidate.id, candidate.workspaceId, graceThresholdMs);

      if (outcome.status === 'purged') {
        purged += 1;
        logger.info('maintenance.purge-pages.purged', {
          rootId: candidate.id,
          kind: candidate.kind,
          deletedContainerCount: outcome.deletedContainerIds.length,
          deletedViewCount: outcome.deletedViewIds.length,
        });
      } else {
        skipped += 1;
      }
    }

    // See the identical comment in `maintenance.purge-workspaces` for why the offset advances
    // only by `skipped` (not `purged`) candidates, and why `hasMoreWork` is derived from this
    // batch's snapshot rather than from `nextOffset` directly.
    const nextOffset = context.payload.offset + skipped;
    const hasMoreWork =
      !context.signal.aborted && context.payload.offset + batch.candidates.length < batch.totalEligible;

    if (hasMoreWork) {
      await context.enqueueChild({
        type: 'maintenance.purge-pages',
        payloadVersion: 1,
        payload: { offset: nextOffset },
        dedupeKey: maintenancePurgePagesDedupeKey(),
      });
    }

    return { scanned: batch.candidates.length, purged, skipped, hasMoreWork };
  },
};
