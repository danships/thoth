import { apiRoute } from '@/lib/api/route-wrapper';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getWorkspaceRepository } from '@/lib/database';
import { getWorkspaceStorageUsage } from '@/lib/files/quota';
import { getSetting } from '@/lib/settings/service';
import { STORAGE_QUOTA_BYTES_KEY } from '@/lib/settings/definitions';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import {
  getWorkspaceStorageUsageParametersSchema,
  type GetWorkspaceStorageUsageParameters,
  type GetWorkspaceStorageUsageResponse,
} from '@/types/api';

// Any workspace member (not owner-only, unlike the quota's own configuration) may see how much
// storage the workspace has used, so the settings UI and editor can both show remaining space.
// The quota itself is platform-managed (THOTH-045) and sourced from the settings service; it may
// be `null` ("no workspace limit").
export const GET = apiRoute<GetWorkspaceStorageUsageResponse, undefined, GetWorkspaceStorageUsageParameters>(
  {
    expectedParamsSchema: getWorkspaceStorageUsageParametersSchema,
  },
  async ({ params }, session) => {
    await assertWorkspaceAccess(session.user.id, params.id);

    // Storage usage is workspace-wide, so an App-key scoped to only a subset of containers
    // (`scopeType !== 'workspace'`) must not be able to read it — that would leak aggregate
    // information beyond what its grant covers.
    if (session.appContext && session.appContext.accessGrant.scopeType !== 'workspace') {
      throw new ForbiddenError('This API key is not scoped to the whole workspace');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', params.id));

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const usedBytes = await getWorkspaceStorageUsage(params.id);
    const quotaBytes = await getSetting(STORAGE_QUOTA_BYTES_KEY, { scope: 'workspace', subjectId: params.id });

    return {
      usedBytes,
      quotaBytes,
    };
  }
);
