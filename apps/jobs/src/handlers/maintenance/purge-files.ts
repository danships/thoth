import { maintenance } from '@thoth/database';
import {
  maintenancePurgeFilesPayloadV1Schema,
  maintenancePurgeFilesDedupeKey,
  type JobDefinition,
  type JobExecutionContext,
  type MaintenancePurgeFilesPayloadV1,
} from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { getLogger } from '../../logger.js';
import { getStorageAdapter } from '../../storage-context.js';

const MAINTENANCE_PURGE_FILES_PRIORITY = 2;
const MAINTENANCE_PURGE_FILES_MAX_ATTEMPTS = 3;

export type MaintenancePurgeFilesResult = {
  scanned: number;
  purged: number;
  skipped: number;
  retryLater: number;
  danglingUsagesPruned: number;
  hasMoreWork: boolean;
};

/**
 * `maintenance.purge-files` — hard-deletes orphaned `uploaded-file` rows (no live `file-usage`)
 * older than the configured grace period, and prunes dangling `file-usage` rows whose container
 * no longer exists, converting the former `scripts/purge-deleted-files.ts` cron script into a
 * bounded, restart-safe job handler (THOTH-063). Storage bytes are deleted before the DB row; a
 * storage-delete failure keeps the row for retry rather than losing track of bytes that may
 * still exist — see `purgeOrphanFile` in `@thoth/database`'s maintenance service.
 *
 * The dangling-usage prune runs once per execution (cheap, and every subsequent candidate
 * selection in the same execution benefits from the up-to-date `liveFileIds` set) — not itself
 * offset/continued, since it operates on the full (typically much smaller) usage table rather
 * than the potentially large file estate.
 */
export const maintenancePurgeFilesJobDefinition: JobDefinition<MaintenancePurgeFilesPayloadV1> = {
  type: 'maintenance.purge-files',
  payloadVersion: 1,
  payloadSchema: maintenancePurgeFilesPayloadV1Schema,
  priority: MAINTENANCE_PURGE_FILES_PRIORITY,
  maxAttempts: MAINTENANCE_PURGE_FILES_MAX_ATTEMPTS,
  dedupeKey: maintenancePurgeFilesDedupeKey,
  handler: async (
    context: JobExecutionContext<MaintenancePurgeFilesPayloadV1>
  ): Promise<MaintenancePurgeFilesResult> => {
    const environment = getEnvironment();
    const logger = getLogger();
    const storageAdapter = getStorageAdapter();

    const now = context.now();
    const graceThresholdMs = maintenance.graceThresholdMsFromHours(now.getTime(), environment.FILES_PURGE_GRACE_PERIOD_HOURS);

    const { prunedCount, liveFileIds } = await maintenance.pruneDanglingFileUsages();

    const batch = await maintenance.selectOrphanFileCandidates({
      liveFileIds,
      graceThresholdMs,
      limit: environment.MAINTENANCE_PURGE_BATCH_SIZE,
      offset: context.payload.offset,
    });

    let purged = 0;
    let skipped = 0;
    let retryLater = 0;

    for (const candidate of batch.candidates) {
      if (context.signal.aborted) {
        break;
      }

      const outcome = await maintenance.purgeOrphanFile(candidate, (storageKey) => storageAdapter.delete(storageKey));

      if (outcome.status === 'purged') {
        purged += 1;
        logger.info('maintenance.purge-files.purged', { fileId: candidate.id });
      } else if (outcome.status === 'skipped') {
        skipped += 1;
      } else {
        retryLater += 1;
        logger.warn('maintenance.purge-files.storage-delete-failed', {
          fileId: candidate.id,
          storageKey: candidate.storageKey,
        });
      }
    }

    // Files that failed storage deletion (`retryLater`) deliberately still count toward the
    // offset advance below — the row is left in place, but this run has already attempted (and
    // logged) it, and the next scheduled occurrence (`offset: 0`) will retry it fresh rather
    // than this same continuation looping on it immediately.
    const processedInThisBatch = purged + skipped + retryLater;
    const nextOffset = context.payload.offset + processedInThisBatch;
    const hasMoreWork = !context.signal.aborted && nextOffset < batch.totalEligible;

    if (hasMoreWork) {
      await context.enqueueChild({
        type: 'maintenance.purge-files',
        payloadVersion: 1,
        payload: { offset: nextOffset },
        dedupeKey: maintenancePurgeFilesDedupeKey(),
      });
    }

    return {
      scanned: batch.candidates.length,
      purged,
      skipped,
      retryLater,
      danglingUsagesPruned: prunedCount,
      hasMoreWork,
    };
  },
};
