import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository, getDataViewRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
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
    const dataViewRepository = await getDataViewRepository();
    const dataView = await dataViewRepository.getOneByQuery(
      addUserIdToQuery(dataViewRepository.createQuery().eq('id', params.id), session.user.id)
    );

    if (!dataView) {
      throw new NotFoundError('Data view not found', true);
    }

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
    const existingDataView = await dataViewRepository.getOneByQuery(
      addUserIdToQuery(dataViewRepository.createQuery().eq('id', params.id), session.user.id)
    );

    if (!existingDataView) {
      throw new NotFoundError('Data view not found');
    }

    // If dataSourceId is being updated, verify the new data source exists and belongs to user
    if (body.dataSourceId && body.dataSourceId !== existingDataView.dataSourceId) {
      const containerRepository = await getContainerRepository();
      const dataSource = await containerRepository.getOneByQuery(
        addUserIdToQuery(containerRepository.createQuery().eq('id', body.dataSourceId), session.user.id).eq(
          'type',
          'data-source'
        )
      );

      if (!dataSource) {
        throw new NotFoundError('Data source not found or access denied.');
      }
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
