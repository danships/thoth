import type { SuperSave } from 'supersave';
import * as entities from '../entities';
import type { Setting, SettingCreate } from '@/types/database';
import type { Workspace } from '@/types/database';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';

const STORAGE_QUOTA_KEY = 'storage.quota_bytes';

/**
 * One-time backfill for THOTH-045: migrates each existing `workspace.storageQuotaBytes` value
 * into a workspace-scoped `storage.quota_bytes` setting row, which becomes the source of truth
 * going forward. Only creates a row when the workspace's quota differs from the registered
 * default (to avoid needless rows) and no setting row already exists. Idempotent.
 *
 * Uses `superSave.getRepository` directly (this runs inside `runMigrations()`, before the cached
 * `getDatabase()` promise resolves — awaiting that here would deadlock).
 */
export async function backfillWorkspaceQuotaSettings(superSave: SuperSave): Promise<void> {
  const workspaceRepository = superSave.getRepository<Workspace>(entities.WORKSPACE_NAME);
  const settingRepository = superSave.getRepository<SettingCreate & { id: string }>(entities.SETTING_NAME);

  const workspaces = await workspaceRepository.getByQuery(workspaceRepository.createQuery());
  const now = new Date().toISOString();

  for (const workspace of workspaces) {
    const quota = workspace.storageQuotaBytes;
    if (quota == null || quota === DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES) {
      continue;
    }

    const existing: Setting[] = await settingRepository.getByQuery(
      settingRepository
        .createQuery()
        .eq('scope', 'workspace')
        .eq('subjectId', workspace.id)
        .eq('key', STORAGE_QUOTA_KEY)
    );
    if (existing.length > 0) {
      continue;
    }

    await settingRepository.create({
      scope: 'workspace',
      subjectId: workspace.id,
      key: STORAGE_QUOTA_KEY,
      value: JSON.stringify(quota),
      createdAt: now,
      lastUpdated: now,
    });
  }
}
