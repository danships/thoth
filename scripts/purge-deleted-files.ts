// scripts/purge-deleted-files.ts
//
// Manual CLI wrapper over `@thoth/database`'s `maintenance.pruneDanglingFileUsages`/
// `maintenance.selectOrphanFileCandidates`/`maintenance.purgeOrphanFile` — the same bounded,
// restart-safe primitives the scheduled `maintenance.purge-files` job
// (`apps/jobs/src/handlers/maintenance/purge-files.ts`) calls (THOTH-063). Run via
// `pnpm files:purge`.
//
// Do not run this manually while `apps/jobs`' own hourly schedule for the same purge type could
// also be running — see the identical caution in `purge-deleted-workspaces.ts`.
import { maintenance } from '@thoth/database';
import { createStorageAdapter } from '@thoth/storage';
import {
  bootstrapDatabase,
  getGracePeriodHoursEnvironmentVariable,
  getMaintenanceBatchSize,
  runPurgeCli,
} from './purge-cli-shared.js';

const DEFAULT_FILES_PURGE_GRACE_PERIOD_HOURS = 24;

async function purgeDeletedFiles(): Promise<string> {
  bootstrapDatabase();

  const storageAdapter = createStorageAdapter({
    type: process.env['STORAGE_TYPE'] ?? 'local',
    localFolder: process.env['STORAGE_LOCAL_FOLDER'] ?? './data/uploads',
  });

  const gracePeriodHours = getGracePeriodHoursEnvironmentVariable(
    'FILES_PURGE_GRACE_PERIOD_HOURS',
    DEFAULT_FILES_PURGE_GRACE_PERIOD_HOURS
  );
  const batchSize = getMaintenanceBatchSize();
  const nowMs = Date.now();
  const graceThresholdMs = maintenance.graceThresholdMsFromHours(nowMs, gracePeriodHours);

  // Dangling `file-usage` pruning runs once up front — it operates on the (typically much
  // smaller) usage table rather than the potentially large file estate, and every subsequent
  // candidate selection below benefits from the resulting up-to-date `liveFileIds` set.
  const { prunedCount, liveFileIds } = await maintenance.pruneDanglingFileUsages();

  let purgedCount = 0;
  let skippedCount = 0;
  let retryLaterCount = 0;
  let offset = 0;

  for (;;) {
    const batch = await maintenance.selectOrphanFileCandidates({
      liveFileIds,
      graceThresholdMs,
      limit: batchSize,
      offset,
    });
    if (batch.candidates.length === 0) {
      break;
    }

    for (const candidate of batch.candidates) {
      const outcome = await maintenance.purgeOrphanFile(candidate, (storageKey) => storageAdapter.delete(storageKey));

      if (outcome.status === 'purged') {
        purgedCount += 1;
        console.log(`Purged orphaned file ${candidate.id} (${candidate.filename})`);
      } else if (outcome.status === 'skipped') {
        skippedCount += 1;
      } else {
        retryLaterCount += 1;
        console.error(
          `Failed to delete storage bytes for file ${candidate.id} (${candidate.storageKey}), will retry later`
        );
      }
    }

    offset += batch.candidates.length;
    if (offset >= batch.totalEligible) {
      break;
    }
  }

  return `${purgedCount} file(s) permanently deleted, ${skippedCount} skipped (now in use), ${retryLaterCount} retained for retry (storage-delete failure), ${prunedCount} dangling file-usage row(s) pruned`;
}

void runPurgeCli('files:purge', purgeDeletedFiles);
