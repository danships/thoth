import { apiRoute } from '@/lib/api/route-wrapper';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getWorkspaceRepository } from '@/lib/database';
import { getWorkspaceStorageUsage } from '@/lib/files/quota';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES } from '@/types/schemas/entities/workspace';
import {
  getWorkspaceStorageUsageParametersSchema,
  type GetWorkspaceStorageUsageParameters,
  type GetWorkspaceStorageUsageResponse,
} from '@/types/api';

// Any workspace member (not owner-only, unlike the quota's own configuration) may see how much
// storage the workspace has used, so the settings UI and editor can both show remaining space.
export const GET = apiRoute<GetWorkspaceStorageUsageResponse, undefined, GetWorkspaceStorageUsageParameters>(
  {
    expectedParamsSchema: getWorkspaceStorageUsageParametersSchema,
  },
  async ({ params }, session) => {
    await assertWorkspaceAccess(session.user.id, params.id);

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const usedBytes = await getWorkspaceStorageUsage(params.id);

    return {
      usedBytes,
      quotaBytes: workspace.storageQuotaBytes ?? DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES,
    };
  }
);
