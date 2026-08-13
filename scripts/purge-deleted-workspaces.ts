// scripts/purge-deleted-workspaces.ts
//
// Manual CLI wrapper over `@thoth/database`'s `maintenance.selectPurgeableWorkspaces`/
// `maintenance.purgeWorkspace` — the same bounded, restart-safe primitives the scheduled
// `maintenance.purge-workspaces` job (`apps/jobs/src/handlers/maintenance/purge-workspaces.ts`)
// calls (THOTH-063). Run via `pnpm workspaces:purge`.
//
// Do not run this manually while `apps/jobs`' own daily schedule for the same purge type could
// also be running — nothing here acquires the scheduler's active-type lock, which is
// process-local to `apps/jobs` and cannot coordinate with a separate CLI invocation.
import { maintenance, type Workspace } from '@thoth/database';
import { createStorageAdapter } from '@thoth/storage';
import {
  bootstrapDatabase,
  getGracePeriodDaysEnvironmentVariable,
  getMaintenanceBatchSize,
  runPurgeCli,
} from './purge-cli-shared.js';

const DEFAULT_WORKSPACE_DELETE_GRACE_PERIOD_DAYS = 30;

async function purgeDeletedWorkspaces(): Promise<string> {
  bootstrapDatabase();

  const storageAdapter = createStorageAdapter({
    type: process.env['STORAGE_TYPE'] ?? 'local',
    localFolder: process.env['STORAGE_LOCAL_FOLDER'] ?? './data/uploads',
  });

  const gracePeriodDays = getGracePeriodDaysEnvironmentVariable(
    'WORKSPACE_DELETE_GRACE_PERIOD_DAYS',
    DEFAULT_WORKSPACE_DELETE_GRACE_PERIOD_DAYS
  );
  const batchSize = getMaintenanceBatchSize();
  const nowMs = Date.now();
  const graceThresholdMs = maintenance.graceThresholdMs(nowMs, gracePeriodDays);

  let purgedCount = 0;
  let skippedCount = 0;
  let offset = 0;

  // Bounded loop, mirroring the scheduled job's continuation contract: each iteration processes
  // one `batchSize`-sized page, advances `offset` by however many candidates were seen, and stops
  // once `offset` reaches the (re-scanned each iteration) total eligible count.
  for (;;) {
    const batch = await maintenance.selectPurgeableWorkspaces({ graceThresholdMs, nowMs, limit: batchSize, offset });
    if (batch.candidates.length === 0) {
      break;
    }

    for (const candidate of batch.candidates as Workspace[]) {
      const outcome = await maintenance.purgeWorkspace(candidate.id, graceThresholdMs, {
        deleteStorageBytes: (storageKey) => storageAdapter.delete(storageKey),
        onStorageDeleteError: (fileId, storageKey) => {
          console.error(`Failed to delete storage bytes for file ${fileId} (${storageKey}) during workspace purge`);
        },
      });

      if (outcome.status === 'purged') {
        purgedCount += 1;
        console.log(`Purged workspace ${candidate.id} (${candidate.name})`);
      } else {
        skippedCount += 1;
      }
    }

    offset += batch.candidates.length;
    if (offset >= batch.totalEligible) {
      break;
    }
  }

  return `${purgedCount} workspace(s) permanently deleted, ${skippedCount} skipped (restored/raced)`;
}

void runPurgeCli('workspaces:purge', purgeDeletedWorkspaces);
