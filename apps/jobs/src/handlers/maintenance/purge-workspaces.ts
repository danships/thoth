import { maintenance } from '@thoth/database';
import {
  maintenancePurgeWorkspacesPayloadV1Schema,
  maintenancePurgeWorkspacesDedupeKey,
  type JobDefinition,
  type JobExecutionContext,
  type MaintenancePurgeWorkspacesPayloadV1,
} from '@thoth/job-protocol';
import { getEnvironment } from '../../environment.js';
import { getLogger } from '../../logger.js';
import { getStorageAdapter } from '../../storage-context.js';

// Maintenance work is low-priority, best-effort background housekeeping — never allowed to
// starve out user-triggered webhook/history work.
const MAINTENANCE_PURGE_WORKSPACES_PRIORITY = 2;
const MAINTENANCE_PURGE_WORKSPACES_MAX_ATTEMPTS = 3;

export type MaintenancePurgeWorkspacesResult = {
  scanned: number;
  purged: number;
  skipped: number;
  hasMoreWork: boolean;
};

/**
 * `maintenance.purge-workspaces` — hard-deletes soft-deleted workspaces (and every
 * cascade-owned row — see `@thoth/database`'s `services/maintenance/workspace-cascade.ts`)
 * whose grace period has expired, converting the former `scripts/purge-deleted-workspaces.ts`
 * cron script into a bounded, restart-safe job handler (THOTH-063). Scheduled daily (see
 * `../../index.ts`); also invocable directly by the `pnpm workspaces:purge` CLI wrapper
 * (`../../cli/purge-workspaces.ts`) via the same underlying `@thoth/database` primitives.
 *
 * Bounded by `MAINTENANCE_PURGE_BATCH_SIZE` per execution; when more eligible workspaces remain,
 * enqueues a same-dedupe-key continuation carrying the next `offset` so a huge backlog never
 * monopolises a worker slot across one execution. The type-level dedupe key
 * (`maintenance:purge-workspaces`) also means a repeated parent after a crash reuses/coalesces
 * with any already-queued continuation rather than multiplying it.
 */
export const maintenancePurgeWorkspacesJobDefinition: JobDefinition<MaintenancePurgeWorkspacesPayloadV1> = {
  type: 'maintenance.purge-workspaces',
  payloadVersion: 1,
  payloadSchema: maintenancePurgeWorkspacesPayloadV1Schema,
  priority: MAINTENANCE_PURGE_WORKSPACES_PRIORITY,
  maxAttempts: MAINTENANCE_PURGE_WORKSPACES_MAX_ATTEMPTS,
  dedupeKey: maintenancePurgeWorkspacesDedupeKey,
  handler: async (
    context: JobExecutionContext<MaintenancePurgeWorkspacesPayloadV1>
  ): Promise<MaintenancePurgeWorkspacesResult> => {
    const environment = getEnvironment();
    const logger = getLogger();
    const storageAdapter = getStorageAdapter();

    const now = context.now();
    const graceThresholdMs = maintenance.graceThresholdMs(now.getTime(), environment.WORKSPACE_DELETE_GRACE_PERIOD_DAYS);

    const batch = await maintenance.selectPurgeableWorkspaces({
      graceThresholdMs,
      nowMs: now.getTime(),
      limit: environment.MAINTENANCE_PURGE_BATCH_SIZE,
      offset: context.payload.offset,
    });

    let purged = 0;
    let skipped = 0;

    for (const candidate of batch.candidates) {
      if (context.signal.aborted) {
        // Lease/abort lost mid-batch: stop before selecting/deleting the next target.
        break;
      }

      const outcome = await maintenance.purgeWorkspace(candidate.id, graceThresholdMs, {
        deleteStorageBytes: (storageKey) => storageAdapter.delete(storageKey),
        onStorageDeleteError: (fileId, storageKey) => {
          logger.warn('maintenance.purge-workspaces.storage-delete-failed', { fileId, storageKey });
        },
      });

      if (outcome.status === 'purged') {
        purged += 1;
        logger.info('maintenance.purge-workspaces.purged', { workspaceId: candidate.id, counts: outcome.counts });
      } else {
        skipped += 1;
      }
    }

    // A `purged` candidate is hard-deleted, so it's gone from the eligible set on the next
    // continuation query — the offset must NOT advance past it, since every unseen candidate
    // that followed it in this batch's snapshot shifts down to fill its place. Only a `skipped`
    // candidate (restored, hard-deleted from under us, or a raced revalidation failure) can
    // still be present at its original position, so the offset advances only by that count.
    // `hasMoreWork` is based on this batch's snapshot (`totalEligible`/`candidates.length`)
    // rather than `nextOffset`, since a fully-purged batch would otherwise leave `nextOffset`
    // unchanged even though more eligible workspaces remain beyond this page.
    const nextOffset = context.payload.offset + skipped;
    const hasMoreWork =
      !context.signal.aborted && context.payload.offset + batch.candidates.length < batch.totalEligible;

    if (hasMoreWork) {
      await context.enqueueChild({
        type: 'maintenance.purge-workspaces',
        payloadVersion: 1,
        payload: { offset: nextOffset },
        dedupeKey: maintenancePurgeWorkspacesDedupeKey(),
      });
    }

    return { scanned: batch.candidates.length, purged, skipped, hasMoreWork };
  },
};
