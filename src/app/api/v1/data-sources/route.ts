import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { CreateDataSourceBody, CreateDataSourceResponse, GetDataSourcesResponse } from '@/types/api';
import { createDataSourceBodySchema } from '@/types/api';
import { DataSourceContainerCreate } from '@/types/database';

export const GET = apiRoute<GetDataSourcesResponse, {}, {}>({}, async (_, session) => {
  const containerRepository = await getContainerRepository();
  const dataSources = await containerRepository.getByQuery(
    // eslint-disable-next-line unicorn/no-array-sort
    addUserIdToQuery(containerRepository.createQuery(), session.user.id).eq('type', 'data-source').sort('name')
  );

  return dataSources.map((dataSource) => ({
    id: dataSource.id,
    name: dataSource.name,
    createdAt: dataSource.createdAt,
    lastUpdated: dataSource.lastUpdated,
  }));
});

export const POST = apiRoute<CreateDataSourceResponse, {}, {}, CreateDataSourceBody>(
  {
    expectedBodySchema: createDataSourceBodySchema,
  },
  async ({ body }, session) => {
    if (!body) {
      throw new Error('Body is required');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
    );

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
    };

    const createdDataSource = await containerRepository.create(dataSourceData);

    return {
      id: createdDataSource.id,
      name: createdDataSource.name,
      createdAt: createdDataSource.createdAt,
      lastUpdated: createdDataSource.lastUpdated,
    } satisfies CreateDataSourceResponse;
  }
);
