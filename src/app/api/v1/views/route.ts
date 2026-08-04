import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository, getWorkspaceRepository } from '@/lib/database';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { resolveDefaultWorkspaceId } from '@/lib/database/resolve-workspace';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession, filterContainersByGrantForSession } from '@/lib/auth/access-grant';
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

    // Pattern L (list): a `workspaceId` is required to scope the query. When `dataSourceId` is
    // given, derive the workspace from it (already access-checked by the retriever); otherwise
    // fall back to an explicit `workspaceId` or the caller's default workspace, matching the
    // GET/POST pattern used elsewhere (THOTH-042).
    let workspaceId: string;
    if (query?.dataSourceId) {
      const dataSource = await dataSourceRetriever.retrieveDataSource(query.dataSourceId, session.user.id);
      await assertGrantAllowsContainerForSession(session, dataSource);
      workspaceId = dataSource.workspaceId;
    } else {
      workspaceId = query?.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
      await assertWorkspaceAccess(session.user.id, workspaceId);
    }

    let databaseQuery = addWorkspaceIdToQuery(dataViewRepository.createQuery(), workspaceId).sort('createdAt', 'desc');

    if (query?.dataSourceId) {
      databaseQuery = databaseQuery.eq('dataSourceId', query.dataSourceId);
    }

    const dataViews = await dataViewRepository.getByQuery(databaseQuery);
    const scopedDataViews = await filterContainersByGrantForSession(
      session,
      dataViews.filter((dataView) => !dataView.deletedAt)
    );

    return scopedDataViews.map((dataView) => ({
      id: dataView.id,
      name: dataView.name,
      dataSourceId: dataView.dataSourceId,
      createdAt: dataView.createdAt,
      lastUpdated: dataView.lastUpdated,
      filters: dataView.filters,
      sorts: dataView.sorts,
      columns: dataView.columns,
      columnLayout: dataView.columnLayout,
    }));
  }
);

export const POST = apiRoute<CreateDataViewResponse, {}, {}, CreateDataViewBody>(
  {
    expectedBodySchema: createDataViewBodySchema,
  },
  async ({ body }, session) => {
    // Content is scoped by workspace membership + grant, not creator (THOTH-042).
    const dataSource = await dataSourceRetriever.retrieveDataSource(body.dataSourceId, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource);

    const workspaceId =
      body.workspaceId ?? dataSource.workspaceId ?? (await resolveDefaultWorkspaceId(session.user.id));
    await assertWorkspaceAccess(session.user.id, workspaceId);

    if (workspaceId !== dataSource.workspaceId) {
      throw new NotFoundError('Data source not found or access denied.');
    }

    const workspaceRepository = await getWorkspaceRepository();
    const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));

    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const containerRepository = await getContainerRepository();
    let pageToLink: Container | undefined | null;
    if (body.pageId) {
      // Pattern C: derived from the already-authorised data source's own workspace.
      pageToLink = await containerRepository.getOneByQuery(
        addWorkspaceIdToQuery(containerRepository.createQuery().eq('id', body.pageId), workspace.id).eq('type', 'page')
      );

      if (!pageToLink || pageToLink.deletedAt || pageToLink.workspaceId !== workspace.id) {
        throw new NotFoundError('Page not found or access denied.');
      }
      await assertGrantAllowsContainerForSession(session, pageToLink, { mutating: true });
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
      filters: [],
      sorts: [],
      // No layout to resolve yet — `resolveDataViewColumnLayout` treats `null` as Name first,
      // followed by all current Data Source columns, all visible (THOTH-052).
      columnLayout: null,
      deletedAt: null,
      deletedRootId: null,
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
      filters: createdDataView.filters,
      sorts: createdDataView.sorts,
      columns: createdDataView.columns,
      columnLayout: createdDataView.columnLayout,
    } satisfies CreateDataViewResponse;
  }
);
