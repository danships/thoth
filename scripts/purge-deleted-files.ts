// scripts/purge-deleted-files.ts
//
// Orphan-cleanup background job for uploaded files (THOTH-040). Hard-deletes `uploaded-file`
// rows that have zero `file-usage` rows and are older than a grace period (default 24h, via
// `FILES_PURGE_GRACE_PERIOD_HOURS`) — long enough to tolerate in-progress edits where a page's
// `file-usage` rows haven't synced yet. Also removes storage bytes for purged files, and prunes
// any dangling `file-usage` rows whose `containerId` no longer points at a live page. Idempotent
// and safe to run on a schedule (no in-app job scheduler is introduced for this ticket — invoke
// via `pnpm files:purge` from an external cron). Mirrors `scripts/purge-deleted-workspaces.ts`.
import 'dotenv/config';
import {
  getContainerRepository,
  getDatabase,
  getFileUsageRepository,
  getUploadedFileRepository,
} from '../apps/web/src/lib/database/index.js';
import { getStorageAdapter } from '../apps/web/src/lib/storage/index.js';

const DEFAULT_GRACE_PERIOD_HOURS = 24;

function getGracePeriodHours(): number {
  const raw = process.env['FILES_PURGE_GRACE_PERIOD_HOURS'];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_PERIOD_HOURS;
}

async function purgeFiles() {
  await getDatabase();

  const gracePeriodHours = getGracePeriodHours();
  const graceThreshold = Date.now() - gracePeriodHours * 60 * 60 * 1000;

  const uploadedFileRepository = await getUploadedFileRepository();
  const fileUsageRepository = await getFileUsageRepository();
  const containerRepository = await getContainerRepository();
  const storageAdapter = await getStorageAdapter();

  // Load all usage rows and containers once up front, rather than issuing a repository query
  // per row/file below.
  const allUsageRows = await fileUsageRepository.getByQuery(fileUsageRepository.createQuery());
  const allContainers = await containerRepository.getByQuery(containerRepository.createQuery());
  const liveContainerIds = new Set(allContainers.map((container) => container.id));

  // Prune `file-usage` rows whose `containerId` no longer exists (e.g. the page was hard
  // deleted) — this can turn a previously-in-use file into an orphan candidate below. Collect the
  // fileIds referenced by the remaining, valid usage rows so the purge loop can do an in-memory
  // lookup instead of a query per file.
  let prunedUsageCount = 0;
  const liveFileIds = new Set<string>();
  for (const usageRow of allUsageRows) {
    if (liveContainerIds.has(usageRow.containerId)) {
      liveFileIds.add(usageRow.fileId);
    } else {
      await fileUsageRepository.deleteUsingId(usageRow.id);
      prunedUsageCount += 1;
    }
  }

  const files = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery());
  let purgedCount = 0;

  for (const file of files) {
    const createdAtMs = Date.parse(file.createdAt);
    if (Number.isNaN(createdAtMs) || createdAtMs > graceThreshold) {
      // Too recent — tolerate in-progress edits that haven't synced `file-usage` yet.
      continue;
    }

    if (liveFileIds.has(file.id)) {
      continue;
    }

    try {
      await storageAdapter.delete(file.storageKey);
    } catch (error) {
      // Keep the database row so this file is retried on the next run rather than losing track
      // of storage bytes that failed to delete.
      console.error(`Failed to delete storage bytes for file ${file.id} (${file.storageKey}), will retry later`, error);
      continue;
    }

    await uploadedFileRepository.deleteUsingId(file.id);
    purgedCount += 1;
    console.log(`Purged orphaned file ${file.id} (${file.filename})`);
  }

  console.log(
    `✅  Purge complete. ${purgedCount} file(s) permanently deleted, ${prunedUsageCount} dangling file-usage row(s) pruned.`
  );
}

await purgeFiles();
