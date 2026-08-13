// scripts/purge-deleted-pages.ts
//
// Manual CLI wrapper over `@thoth/database`'s `maintenance.selectPurgeableDeletedRoots`/
// `maintenance.permanentlyDeleteDeletedRoot` — the same bounded, restart-safe primitives the
// scheduled `maintenance.purge-pages` job (`apps/jobs/src/handlers/maintenance/purge-pages.ts`)
// calls (THOTH-063). Run via `pnpm pages:purge`.
//
// Scoped by workspace/root id only, never by creator `userId` (THOTH-042). Do not run this
// manually while `apps/jobs`' own daily schedule for the same purge type could also be running —
// see the identical caution in `purge-deleted-workspaces.ts`.
import { maintenance } from '@thoth/database';
import {
  bootstrapDatabase,
  getGracePeriodDaysEnvironmentVariable,
  getMaintenanceBatchSize,
  runPurgeCli,
} from './purge-cli-shared.js';

const DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS = 30;

async function purgeDeletedPages(): Promise<string> {
  bootstrapDatabase();

  const gracePeriodDays = getGracePeriodDaysEnvironmentVariable(
    'PAGE_DELETE_GRACE_PERIOD_DAYS',
    DEFAULT_PAGE_DELETE_GRACE_PERIOD_DAYS
  );
  const batchSize = getMaintenanceBatchSize();
  const nowMs = Date.now();
  const graceThresholdMs = maintenance.graceThresholdMs(nowMs, gracePeriodDays);

  let purgedCount = 0;
  let skippedCount = 0;
  let offset = 0;

  for (;;) {
    const batch = await maintenance.selectPurgeableDeletedRoots({ graceThresholdMs, nowMs, limit: batchSize, offset });
    if (batch.candidates.length === 0) {
      break;
    }

    for (const candidate of batch.candidates) {
      const outcome = await maintenance.permanentlyDeleteDeletedRoot(
        candidate.id,
        candidate.workspaceId,
        graceThresholdMs
      );

      if (outcome.status === 'purged') {
        purgedCount += 1;
        console.log(
          `Purged ${candidate.kind} root ${candidate.id} (${outcome.deletedContainerIds.length} container(s), ${outcome.deletedViewIds.length} view(s))`
        );
      } else {
        skippedCount += 1;
      }
    }

    offset += batch.candidates.length;
    if (offset >= batch.totalEligible) {
      break;
    }
  }

  return `${purgedCount} deleted root item(s) permanently deleted, ${skippedCount} skipped (restored/raced)`;
}

void runPurgeCli('pages:purge', purgeDeletedPages);
