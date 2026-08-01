import { getUploadedFileRepository, getWorkspaceRepository } from '@/lib/database';
import { ConflictError } from '@/lib/errors/conflict-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';

/**
 * Sums the `size` of every `uploaded-file` row scoped to `workspaceId`. Used both to enforce
 * the per-workspace quota at upload time and to power the `GET /workspaces/:id/storage-usage`
 * endpoint. There is no running counter maintained on the `workspace` row itself — this is a
 * straightforward aggregate query, acceptable at the expected scale of a single workspace's
 * uploaded files.
 */
export async function getWorkspaceStorageUsage(workspaceId: string): Promise<number> {
  const uploadedFileRepository = await getUploadedFileRepository();
  const files = await uploadedFileRepository.getByQuery(
    uploadedFileRepository.createQuery().eq('workspaceId', workspaceId)
  );
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Throws a `409 ConflictError` (`visibleError: true`, so the editor/UI can surface the message
 * verbatim) if adding `additionalBytes` to the workspace's current usage would exceed its
 * configured `storageQuotaBytes` (defaulting to `DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES` for
 * workspaces that predate this field). Checked before writing any bytes to storage.
 *
 * Quota enforcement here is best-effort, not transactional: concurrent uploads racing against
 * the same workspace could both pass this check and jointly exceed the quota by a small margin.
 * This is an accepted limitation (see the spec's "Concurrent uploads" edge case) — a later
 * upload will be rejected once the usage total reflects the race, and the purge job reclaims any
 * orphaned space over time.
 */
export async function assertWithinQuota(workspaceId: string, additionalBytes: number): Promise<void> {
  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));

  if (!workspace) {
    throw new NotFoundError('Workspace not found');
  }

  const quotaBytes = workspace.storageQuotaBytes ?? DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES;
  const currentUsage = await getWorkspaceStorageUsage(workspaceId);

  if (currentUsage + additionalBytes > quotaBytes) {
    throw new ConflictError('Workspace storage limit reached');
  }
}
