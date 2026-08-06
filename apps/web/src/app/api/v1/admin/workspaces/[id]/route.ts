import { apiRoute } from '@/lib/api/route-wrapper';
import { assertPlatformAdmin } from '@/lib/auth/platform-user';
import { getWorkspaceRepository } from '@/lib/database';
import { getSetting, setSetting } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { getWorkspaceStorageUsage } from '@/lib/files/quota';
import { getLogger } from '@/lib/logger';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { AdminWorkspaceParameters, UpdateAdminWorkspaceBody, UpdateAdminWorkspaceResponse } from '@/types/api';
import { adminWorkspaceParametersSchema, updateAdminWorkspaceBodySchema } from '@/types/api';

// `PATCH /api/v1/admin/workspaces/{id}` — set a workspace's storage quota. Platform-admin only;
// does NOT create or require workspace membership (THOTH-045).
export const PATCH = apiRoute<UpdateAdminWorkspaceResponse, {}, AdminWorkspaceParameters, UpdateAdminWorkspaceBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: adminWorkspaceParametersSchema,
    expectedBodySchema: updateAdminWorkspaceBodySchema,
  },
  async ({ params, body }, session) => {
    const admin = await assertPlatformAdmin(session);

    const repository = await getWorkspaceRepository();
    const workspace = await repository.getOneByQuery(repository.createQuery().eq('id', params.id));
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const previousQuota = await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: params.id });

    // Persist the value verbatim — including an explicit `null`, which means "no limit at this
    // scope". We must NOT delete the row on `null`, because the workspace-scope *default* is a
    // real 50MB limit, so deleting would silently fall back to that instead of "no limit".
    await setSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: params.id }, body.storageQuotaBytes);

    const [storageQuotaBytes, usedBytes] = await Promise.all([
      getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: params.id }),
      getWorkspaceStorageUsage(params.id),
    ]);

    const logger = await getLogger();
    logger.info('platform.workspace-quota.update', {
      actorUserId: admin.userId,
      targetWorkspaceId: params.id,
      before: previousQuota,
      after: storageQuotaBytes,
    });

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      deletedAt: workspace.deletedAt ?? null,
      storageQuotaBytes,
      usedBytes,
    };
  }
);
