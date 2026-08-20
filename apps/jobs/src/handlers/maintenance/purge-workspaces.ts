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
import { getSearchService } from '../../search/search-context.js';
import { getStorageAdapter } from '../../storage-context.js';

const MAINTENANCE_PURGE_WORKSPACES_PRIORITY = 2;
const MAINTENANCE_PURGE_WORKSPACES_MAX_ATTEMPTS = 3;

export type MaintenancePurgeWorkspacesResult = {
  scanned: number;
  purged: number;
  skipped: number;
  hasMoreWork: boolean;
};

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
    const searchService = getSearchService();

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
        break;
      }

      const revalidated = await maintenance.revalidateWorkspaceForPurge(candidate.id, graceThresholdMs);
      if (!revalidated) {
        skipped += 1;
        continue;
      }

      try {
        await searchService.deleteWorkspaceIndex(candidate.id);
      } catch (error) {
        logger.warn('maintenance.purge-workspaces.search-delete-failed', {
          workspaceId: candidate.id,
          message: error instanceof Error ? error.message : 'unknown error',
        });
        skipped += 1;
        continue;
      }

      const counts = await maintenance.cascadeDeleteWorkspace(revalidated.id, {
        deleteStorageBytes: (storageKey) => storageAdapter.delete(storageKey),
        onStorageDeleteError: (fileId, storageKey) => {
          logger.warn('maintenance.purge-workspaces.storage-delete-failed', { fileId, storageKey });
        },
      });

      purged += 1;
      logger.info('maintenance.purge-workspaces.purged', { workspaceId: candidate.id, counts });
    }

    const nextOffset = context.payload.offset + skipped;
    const hasMoreWork = !context.signal.aborted && context.payload.offset + batch.candidates.length < batch.totalEligible;

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
