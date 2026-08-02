import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import { getLogger } from '@/lib/logger';
import type {
  DeleteDataSourceParameters,
  GetDataSourceResponse,
  GetDataSourceParameters,
  UpdateDataSourceBody,
  UpdateDataSourceResponse,
  UpdateDataSourceParameters,
} from '@/types/api';
import {
  deleteDataSourceParametersSchema,
  getDataSourceParametersSchema,
  updateDataSourceBodySchema,
  updateDataSourceParametersSchema,
} from '@/types/api';

export const GET = apiRoute<GetDataSourceResponse, undefined, GetDataSourceParameters>(
  {
    expectedParamsSchema: getDataSourceParametersSchema,
  },
  async ({ params }, session) => {
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource);

    return {
      id: dataSource.id,
      name: dataSource.name,
      createdAt: dataSource.createdAt,
      lastUpdated: dataSource.lastUpdated,
      columns: 'columns' in dataSource ? dataSource.columns : [],
    } satisfies GetDataSourceResponse;
  }
);

export const PATCH = apiRoute<UpdateDataSourceResponse, undefined, UpdateDataSourceParameters, UpdateDataSourceBody>(
  {
    expectedBodySchema: updateDataSourceBodySchema,
    expectedParamsSchema: updateDataSourceParametersSchema,
  },
  async ({ body, params }, session) => {
    if (!body) {
      throw new Error('Body is required');
    }

    const containerRepository = await getContainerRepository();

    // Content is scoped by workspace membership + grant, not creator (THOTH-042).
    const existingDataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, existingDataSource, { mutating: true });

    // Update the data source with provided fields
    const filteredBody = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

    const updatedDataSource = await containerRepository.update({
      ...existingDataSource,
      ...filteredBody,
      lastUpdated: new Date().toISOString(),
    });

    return {
      id: updatedDataSource.id,
      name: updatedDataSource.name,
      createdAt: updatedDataSource.createdAt,
      lastUpdated: updatedDataSource.lastUpdated,
      columns: 'columns' in updatedDataSource ? updatedDataSource.columns : [],
    } satisfies UpdateDataSourceResponse;
  }
);

export const DELETE = apiRoute<void, undefined, DeleteDataSourceParameters, {}>(
  {
    expectedParamsSchema: deleteDataSourceParametersSchema,
  },
  async ({ params }, session) => {
    const containerRepository = await getContainerRepository();
    const dataViewRepository = await getDataViewRepository();
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource, { mutating: true });

    const now = new Date().toISOString();

    // Update all active linked views first, and only mark the data source itself deleted once
    // every view update has succeeded — if a view update throws partway through, the data
    // source stays live rather than being left in an inconsistent, partially-cascaded state.
    // Pattern C: anchored on the already-authorised data source's own workspace, not creator
    // (THOTH-042).
    const linkedViews = await dataViewRepository.getByQuery(
      addWorkspaceIdToQuery(dataViewRepository.createQuery().eq('dataSourceId', dataSource.id), dataSource.workspaceId)
    );

    let deletedViewCount = 0;
    for (const linkedView of linkedViews) {
      if (linkedView.deletedAt) {
        continue;
      }

      await dataViewRepository.update({
        ...linkedView,
        deletedAt: now,
        deletedRootId: dataSource.id,
        lastUpdated: now,
      });
      deletedViewCount += 1;
    }

    await containerRepository.update({
      ...dataSource,
      deletedAt: now,
      deletedRootId: dataSource.id,
      lastUpdated: now,
    });

    const logger = await getLogger();
    logger.info('data-source.delete', {
      actorUserId: session.user.id,
      dataSourceId: dataSource.id,
      workspaceId: dataSource.workspaceId,
      deletedViewCount,
    });
  }
);
