import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { filterContainersByGrantForSession } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type {
  CreateDataSourceBody,
  CreateDataSourceResponse,
  GetDataSourcesQuery,
  GetDataSourcesResponse,
} from '@/types/api';
import { createDataSourceBodySchema, getDataSourcesQuerySchema } from '@/types/api';
import { DataSourceContainer, DataSourceContainerCreate } from '@thoth/database/types';
import { randomUUID } from 'node:crypto';

export const GET = apiRoute<GetDataSourcesResponse, GetDataSourcesQuery, {}>(
  { expectedQuerySchema: getDataSourcesQuerySchema },
  async ({ query }, session) => {
    // Pattern L (list): no target id, so the workspace is resolved up front — preferring an
    // explicit `workspaceId` (e.g. the workspace of the page the caller is currently viewing)
    // and only falling back to the caller's default workspace for backwards compatibility —
    // and membership is asserted before scoping the query — content is scoped by workspace
    // membership + grant, not creator (THOTH-042).
    const workspaceId = query.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
    await assertWorkspaceAccess(session.user.id, workspaceId);

    const containerRepository = await getContainerRepository();
    const dataSources = await containerRepository.getByQuery(
      addWorkspaceIdToQuery(containerRepository.createQuery(), workspaceId).eq('type', 'data-source').sort('name')
    );

    const scopedDataSources = await filterContainersByGrantForSession(
      session,
      dataSources.filter((container): container is DataSourceContainer => container.type === 'data-source')
    );

    return scopedDataSources
      .filter((dataSource) => !dataSource.deletedAt)
      .map((dataSource) => ({
        id: dataSource.id,
        name: dataSource.name,
        createdAt: dataSource.createdAt,
        lastUpdated: dataSource.lastUpdated,
        columns: dataSource.columns ?? [],
      }));
  }
);

export const POST = apiRoute<CreateDataSourceResponse, {}, {}, CreateDataSourceBody>(
  {
    expectedBodySchema: createDataSourceBodySchema,
  },
  async ({ body }, session) => {
    // No existing entity to derive the workspace from — `workspaceId` (falling back to the
    // caller's default workspace for backwards compatibility) is required and validated here.
    let workspaceId = body.workspaceId;
    if (!workspaceId) {
      workspaceId = await resolveDefaultWorkspaceId(session.user.id);
    }
    await assertWorkspaceAccess(session.user.id, workspaceId);

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const containerRepository = await getContainerRepository();

    const dataSourceData: DataSourceContainerCreate = {
      name: body.name,
      workspaceId: workspace.id,
      userId: session.user.id,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      parentId: null,
      type: 'data-source',
      columns: body.columns?.map((column) => ({ id: randomUUID(), ...column })) ?? [],
      deletedAt: null,
      deletedRootId: null,
      isPrivate: false,
      privateRootId: null,
    };

    const createdDataSource = await containerRepository.create(dataSourceData);

    return {
      id: createdDataSource.id,
      name: createdDataSource.name,
      createdAt: createdDataSource.createdAt,
      lastUpdated: createdDataSource.lastUpdated,
      columns: 'columns' in createdDataSource ? createdDataSource.columns : [],
    } satisfies CreateDataSourceResponse;
  }
);
