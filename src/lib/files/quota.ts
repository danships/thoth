import { getUploadedFileRepository } from '@/lib/database';
import { ConflictError } from '@/lib/errors/conflict-error';
import { getSetting } from '@/lib/settings/service';
import { PLATFORM_SETTING_SUBJECT_ID, STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';

/**
 * Sums the `size` of every `uploaded-file` row scoped to `workspaceId`. Used both to enforce the
 * per-workspace quota at upload time and to power `GET /workspaces/:id/storage-usage`. A simple
 * aggregate query, acceptable at the expected scale of a single workspace's uploaded files.
 */
export async function getWorkspaceStorageUsage(workspaceId: string): Promise<number> {
  const uploadedFileRepository = await getUploadedFileRepository();
  const files = await uploadedFileRepository.getByQuery(
    uploadedFileRepository.createQuery().eq('workspaceId', workspaceId)
  );
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Sums the `size` of every `uploaded-file` row billed to `billingUserId` (THOTH-045). For
 * cookie uploads this equals the uploader; for App-attributed uploads it's the owning App's
 * creator, so a per-user quota is charged to a real human regardless of attribution mode.
 */
export async function getUserStorageUsage(billingUserId: string): Promise<number> {
  const uploadedFileRepository = await getUploadedFileRepository();
  const files = await uploadedFileRepository.getByQuery(
    uploadedFileRepository.createQuery().eq('billingUserId', billingUserId)
  );
  return files.reduce((total, file) => total + file.size, 0);
}

/**
 * Sums the `size` of every `uploaded-file` row across the whole platform (THOTH-045). Powers the
 * platform-wide quota check and the admin overview's total-usage display.
 */
export async function getPlatformStorageUsage(): Promise<number> {
  const uploadedFileRepository = await getUploadedFileRepository();
  const files = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery());
  return files.reduce((total, file) => total + file.size, 0);
}

type StorageQuotaCheck = {
  workspaceId: string;
  billingUserId: string;
  additionalBytes: number;
};

/**
 * Enforces every applicable uploaded-file storage quota before writing any bytes (THOTH-045).
 * Resolves the `storage.quota_bytes` setting at workspace, user, and platform scope, loads the
 * matching usage totals, and checks in order workspace -> user -> platform. A `null` limit at a
 * scope is skipped ("no limit"); `0` means no capacity. Throws `ConflictError` (409, visible)
 * naming only the first failed scope.
 *
 * Enforcement is best-effort, not transactional: concurrent uploads racing the same scope could
 * both pass and jointly exceed a limit by a small margin — an accepted limitation (a later
 * upload is rejected once usage reflects the race, and the purge job reclaims orphaned space).
 */
export async function assertWithinStorageQuotas({
  workspaceId,
  billingUserId,
  additionalBytes,
}: StorageQuotaCheck): Promise<void> {
  const [workspaceLimit, userLimit, platformLimit] = await Promise.all([
    getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: workspaceId }),
    getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'user', subjectId: billingUserId }),
    getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'platform', subjectId: PLATFORM_SETTING_SUBJECT_ID }),
  ]);

  if (workspaceLimit !== null) {
    const usage = await getWorkspaceStorageUsage(workspaceId);
    if (usage + additionalBytes > workspaceLimit) {
      throw new ConflictError('Workspace storage limit reached');
    }
  }

  if (userLimit !== null) {
    const usage = await getUserStorageUsage(billingUserId);
    if (usage + additionalBytes > userLimit) {
      throw new ConflictError('User storage limit reached');
    }
  }

  if (platformLimit !== null) {
    const usage = await getPlatformStorageUsage();
    if (usage + additionalBytes > platformLimit) {
      throw new ConflictError('Platform storage limit reached');
    }
  }
}
