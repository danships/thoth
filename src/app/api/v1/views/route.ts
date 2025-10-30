import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository, getWorkspaceRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { CreateDataViewBody, CreateDataViewResponse, GetDataViewsResponse, GetDataViewsQuery } from '@/types/api';
import { createDataViewBodySchema, getDataViewsQuerySchema } from '@/types/api';
import { Container, PageContainer } from '@/types/database';

export const GET = apiRoute<GetDataViewsResponse, GetDataViewsQuery, {}>(
  {
    expectedQuerySchema: getDataViewsQuerySchema,
  },
  async ({ query }, session) => {
    const dataViewRepository = await getDataViewRepository();
    let databaseQuery = addUserIdToQuery(dataViewRepository.createQuery(), session.user.id).sort('createdAt', 'desc');

    // Optional filtering by data source ID
    if (query?.dataSourceId) {
      databaseQuery = databaseQuery.eq('dataSourceId', query.dataSourceId);
    }

    const dataViews = await dataViewRepository.getByQuery(databaseQuery);

    return dataViews.map((dataView) => ({
      id: dataView.id,
      name: dataView.name,
      dataSourceId: dataView.dataSourceId,
      createdAt: dataView.createdAt,
      lastUpdated: dataView.lastUpdated,
    }));
  }
);

export const POST = apiRoute<CreateDataViewResponse, {}, {}, CreateDataViewBody>(
  {
    expectedBodySchema: createDataViewBodySchema,
  },
  async ({ body }, session) => {
    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(
      addUserIdToQuery(workspaceRepository.createQuery(), session.user.id)
    );

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    // Verify that the data source exists and belongs to the user
    const containerRepository = await getContainerRepository();
    const dataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', body.dataSourceId), session.user.id)
        .eq('workspaceId', workspace.id)
        .eq('type', 'data-source')
    );

    if (!dataSource) {
      throw new NotFoundError('Data source not found or access denied.');
    }

    let pageToLink: Container | undefined | null;
    if (body.pageId) {
      pageToLink = await containerRepository.getOneByQuery(
        addUserIdToQuery(containerRepository.createQuery().eq('id', body.pageId), session.user.id)
          .eq('workspaceId', workspace.id)
          .eq('type', 'page')
      );
    }

    const dataViewRepository = await getDataViewRepository();
    const dataViewData = {
      name: body.name,
      dataSourceId: body.dataSourceId,
      workspaceId: workspace.id,
      userId: session.user.id,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      columns: [],
    };

    const createdDataView = await dataViewRepository.create(dataViewData);

    if (pageToLink && pageToLink.type === 'page') {
      await containerRepository.update({
        ...pageToLink,
        views: [...(pageToLink.views ?? []), createdDataView.id],
      } satisfies PageContainer);
    }

    return {
      id: createdDataView.id,
      name: createdDataView.name,
      dataSourceId: createdDataView.dataSourceId,
      createdAt: createdDataView.createdAt,
      lastUpdated: createdDataView.lastUpdated,
    } satisfies CreateDataViewResponse;
  }
);
