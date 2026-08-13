import { getContainerRepository, getFileUsageRepository, getUploadedFileRepository } from '../../repositories.js';
import type { UploadedFile } from '../../types.js';
import { isPastGraceThreshold } from './grace.js';

export type PruneDanglingUsageResult = {
  prunedCount: number;
  /** Distinct `fileId`s still referenced by a live (non-dangling) usage row, at scan time. */
  liveFileIds: Set<string>;
};

/**
 * Prunes `file-usage` rows whose `containerId` no longer points at a live page (e.g. the page
 * was hard-deleted) — this can turn a previously-in-use file into an orphan candidate. Returns
 * the set of `fileId`s still referenced by a remaining, valid usage row, so the caller can do an
 * in-memory "is this file live" check instead of a query per candidate file.
 */
export async function pruneDanglingFileUsages(): Promise<PruneDanglingUsageResult> {
  const fileUsageRepository = await getFileUsageRepository();
  const containerRepository = await getContainerRepository();

  const allUsageRows = await fileUsageRepository.getByQuery(fileUsageRepository.createQuery());
  const allContainers = await containerRepository.getByQuery(containerRepository.createQuery());
  const liveContainerIds = new Set(allContainers.map((container) => container.id));

  let prunedCount = 0;
  const liveFileIds = new Set<string>();
  for (const usageRow of allUsageRows) {
    if (liveContainerIds.has(usageRow.containerId)) {
      liveFileIds.add(usageRow.fileId);
    } else {
      await fileUsageRepository.deleteUsingId(usageRow.id);
      prunedCount += 1;
    }
  }

  return { prunedCount, liveFileIds };
}

export type FilePurgeBatch = {
  candidates: UploadedFile[];
  totalEligible: number;
};

/**
 * Selects up to `limit` orphaned (no live usage) `uploaded-file` rows older than
 * `graceThresholdMs`, skipping `offset` such candidates first. `liveFileIds` should be the
 * result of a prior `pruneDanglingFileUsages()` call in the same execution.
 */
export async function selectOrphanFileCandidates(options: {
  liveFileIds: ReadonlySet<string>;
  graceThresholdMs: number;
  limit: number;
  offset: number;
}): Promise<FilePurgeBatch> {
  const uploadedFileRepository = await getUploadedFileRepository();
  const allFiles = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery());

  const eligible = allFiles.filter(
    (file) => !options.liveFileIds.has(file.id) && isPastGraceThreshold(file.createdAt, options.graceThresholdMs)
  );

  return {
    candidates: eligible.slice(options.offset, options.offset + options.limit),
    totalEligible: eligible.length,
  };
}

export type FilePurgeOutcome =
  | { status: 'purged' }
  | { status: 'skipped'; reason: 'now-in-use' }
  | { status: 'retry-later'; reason: 'storage-delete-failed' };

/**
 * Revalidates usage for a single candidate file immediately before deletion (an upload attach
 * racing the scan must not be purged), deletes its storage bytes, then its DB row — in that
 * order, so a storage-delete failure leaves the DB row in place for a later retry rather than
 * losing track of bytes that may still exist. `deleteStorageBytes` is expected to be a no-op
 * (not throw) for an already-missing key, matching `StorageAdapter#delete`'s documented
 * contract — any thrown error is treated as a genuine, retryable failure.
 */
export async function purgeOrphanFile(
  file: UploadedFile,
  deleteStorageBytes: (storageKey: string) => Promise<void>
): Promise<FilePurgeOutcome> {
  const fileUsageRepository = await getFileUsageRepository();
  const uploadedFileRepository = await getUploadedFileRepository();

  // Immediate revalidation: re-query usage for this exact file right before deleting anything.
  const stillInUse = await fileUsageRepository.getOneByQuery(fileUsageRepository.createQuery().eq('fileId', file.id));
  if (stillInUse) {
    return { status: 'skipped', reason: 'now-in-use' };
  }

  try {
    await deleteStorageBytes(file.storageKey);
  } catch {
    // Keep the DB row so this file is retried on the next run rather than losing track of
    // storage bytes that may have failed to delete for a transient reason.
    return { status: 'retry-later', reason: 'storage-delete-failed' };
  }

  await uploadedFileRepository.deleteUsingId(file.id);
  return { status: 'purged' };
}
