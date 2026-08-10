import { apiRoute } from '@/lib/api/route-wrapper';
import { getAppRepository } from '@/lib/database';
import { syncAppWorkspaceMembership } from '@/lib/database/app-service';
import { hydrateAppResponse } from '@/lib/database/app-response';
import { assertContainerIdsBelongToWorkspace, replaceScopedContainers } from '@/lib/database/app-scope-service';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import type { CreateAppBody, CreateAppResponse, GetAppsResponse, ListAppsQuery } from '@/types/api';
import { createAppBodySchema, listAppsQuerySchema } from '@/types/api';

export const GET = apiRoute<GetAppsResponse, ListAppsQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: listAppsQuerySchema,
  },
  async ({ query }, session) => {
    await assertWorkspaceAccess(session.user.id, query.workspaceId);

    const appRepository = await getAppRepository();
    const apps = await appRepository.getByQuery(
      appRepository.createQuery().eq('workspaceId', query.workspaceId).sort('createdAt', 'desc')
    );

    return {
      apps: await Promise.all(apps.map((app) => hydrateAppResponse(app))),
    };
  }
);

export const POST = apiRoute<CreateAppResponse, {}, {}, CreateAppBody>(
  {
    disallowApiKey: true,
    expectedBodySchema: createAppBodySchema,
  },
  async ({ body }, session) => {
    await assertWorkspaceAccess(session.user.id, body.workspaceId);

    if (body.scopeType !== 'workspace') {
      await assertContainerIdsBelongToWorkspace(body.containerIds ?? [], body.workspaceId);
    }

    const appRepository = await getAppRepository();
    const now = new Date().toISOString();

    const createdApp = await appRepository.create({
      workspaceId: body.workspaceId,
      label: body.label,
      createdByUserId: session.user.id,
      attributionMode: body.attributionMode,
      permission: body.permission,
      scopeType: body.scopeType,
      archivedAt: null,
      createdAt: now,
      lastUpdated: now,
    });

    if (body.scopeType !== 'workspace') {
      await replaceScopedContainers(createdApp.id, body.containerIds ?? []);
    }

    await syncAppWorkspaceMembership(createdApp);

    return hydrateAppResponse(createdApp);
  }
);
