import { apiRoute } from '@/lib/api/route-wrapper';
import { getDataViewRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { dataViewRetriever } from '@/lib/database/retrievers/data-view-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { assertValidFilterSortRules } from '@/lib/database/page-query-service';
import { getLogger } from '@/lib/logger';
import type {
  DeleteViewParameters,
  GetDataViewResponse,
  GetDataViewParameters,
  UpdateDataViewBody,
  UpdateDataViewResponse,
  UpdateDataViewParameters,
} from '@/types/api';
import {
  deleteViewParametersSchema,
  getDataViewParametersSchema,
  updateDataViewBodySchema,
  updateDataViewParametersSchema,
} from '@/types/api';
export const GET = apiRoute<GetDataViewResponse, undefined, GetDataViewParameters>(
  {
    expectedParamsSchema: getDataViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataView);

    return {
      id: dataView.id,
      name: dataView.name,
      dataSourceId: dataView.dataSourceId,
      createdAt: dataView.createdAt,
      lastUpdated: dataView.lastUpdated,
      filters: dataView.filters,
      sorts: dataView.sorts,
    };
  }
);

export const PATCH = apiRoute<UpdateDataViewResponse, undefined, UpdateDataViewParameters, UpdateDataViewBody>(
  {
    expectedBodySchema: updateDataViewBodySchema,
    expectedParamsSchema: updateDataViewParametersSchema,
  },
  async ({ body, params }, session) => {
    const dataViewRepository = await getDataViewRepository();

    // Verify the data view exists and belongs to the user
    const existingDataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, existingDataView, { mutating: true });

    // If dataSourceId is being updated, verify the new data source exists and belongs to user
    if (body.dataSourceId && body.dataSourceId !== existingDataView.dataSourceId) {
      await dataSourceRetriever.retrieveDataSource(body.dataSourceId, session.user.id);
    }

    // Validate `filters`/`sorts` against the (possibly newly-set) data source's own columns
    // before persisting — an invalid columnId/operator/value combination must 400, not be
    // silently accepted (THOTH-037). Must run whenever `dataSourceId` changes too (not just
    // `filters`/`sorts`), since existing rules may no longer be valid against the new data
    // source's columns; the effective rule set is the body's value when provided, falling back
    // to the existing view's persisted value otherwise.
    if (body.dataSourceId !== undefined || body.filters !== undefined || body.sorts !== undefined) {
      const dataSourceId = body.dataSourceId ?? existingDataView.dataSourceId;
      const dataSource = await dataSourceRetriever.retrieveDataSource(dataSourceId, session.user.id);
      assertValidFilterSortRules(
        dataSource.columns,
        body.filters ?? existingDataView.filters ?? [],
        body.sorts ?? existingDataView.sorts ?? []
      );
    }

    const filteredBody = Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));

    const updatedDataView = await dataViewRepository.update({
      ...existingDataView,
      ...filteredBody,
      lastUpdated: new Date().toISOString(),
    });

    return {
      id: updatedDataView.id,
      name: updatedDataView.name,
      createdAt: updatedDataView.createdAt,
      lastUpdated: updatedDataView.lastUpdated,
      dataSourceId: updatedDataView.dataSourceId,
      filters: updatedDataView.filters,
      sorts: updatedDataView.sorts,
    } satisfies UpdateDataViewResponse;
  }
);

export const DELETE = apiRoute<void, undefined, DeleteViewParameters, {}>(
  {
    expectedParamsSchema: deleteViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataViewRepository = await getDataViewRepository();
    const dataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataView, { mutating: true });

    const now = new Date().toISOString();
    await dataViewRepository.update({
      ...dataView,
      deletedAt: now,
      deletedRootId: dataView.id,
      lastUpdated: now,
    });

    const logger = await getLogger();
    logger.info('view.delete', {
      actorUserId: session.user.id,
      viewId: dataView.id,
      workspaceId: dataView.workspaceId,
    });
  }
);
