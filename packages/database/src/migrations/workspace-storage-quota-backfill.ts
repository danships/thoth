import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '../schemas/entities/workspace';
import type { Workspace } from '../types';

/**
 * One-time backfill for `Workspace` rows created before THOTH-040's storage-quota field:
 * assigns `storageQuotaBytes` to the default (50 MB) where missing. Not strictly required for
 * correctness — the Zod schema already defaults the field on read (see
 * `src/types/schemas/entities/workspace.ts`) — but persists the default onto existing rows so
 * they read back identically regardless of code path (e.g. raw SQL reporting).
 *
 * The `uploaded-file`/`file-usage` tables themselves need no migration entry: SuperSave's
 * `addEntity` (called unconditionally for every entity in `initializeDatabase()`) always issues
 * `CREATE TABLE IF NOT EXISTS` regardless of `SUPERSAVE_SKIP_SYNC` — only the filter/sort-field
 * column sync is skipped in production, and neither entity queries/sorts on a field that isn't
 * already listed in its `filterSortFields`.
 */
export async function backfillWorkspaceStorageQuota(superSave: SuperSave): Promise<void> {
  const workspaceRepository = superSave.getRepository<Workspace>(entities.WORKSPACE_NAME);

  const workspaces = await workspaceRepository.getByQuery(workspaceRepository.createQuery());

  for (const workspace of workspaces) {
    if (workspace.storageQuotaBytes !== undefined && workspace.storageQuotaBytes !== null) {
      continue;
    }

    await workspaceRepository.update({
      ...workspace,
      storageQuotaBytes: DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    });
  }
}
