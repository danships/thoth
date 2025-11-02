import { apiRoute } from '@/lib/api/route-wrapper';
import { getDataViewRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { dataViewRetriever } from '@/lib/database/retrievers/data-view-retriever';
import type {
  GetDataViewResponse,
  GetDataViewParameters,
  UpdateDataViewBody,
  UpdateDataViewResponse,
  UpdateDataViewParameters,
} from '@/types/api';
import { getDataViewParametersSchema, updateDataViewBodySchema, updateDataViewParametersSchema } from '@/types/api';
export const GET = apiRoute<GetDataViewResponse, undefined, GetDataViewParameters>(
  {
    expectedParamsSchema: getDataViewParametersSchema,
  },
  async ({ params }, session) => {
    const dataView = await dataViewRetriever.retrieveDataView(params.id, session.user.id);

    return {
      id: dataView.id,
      name: dataView.name,
      dataSourceId: dataView.dataSourceId,
      createdAt: dataView.createdAt,
      lastUpdated: dataView.lastUpdated,
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

    // If dataSourceId is being updated, verify the new data source exists and belongs to user
    if (body.dataSourceId && body.dataSourceId !== existingDataView.dataSourceId) {
      await dataSourceRetriever.retrieveDataSource(body.dataSourceId, session.user.id);
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
    } satisfies UpdateDataViewResponse;
  }
);
