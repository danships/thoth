import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import type {
  GetDataSourceResponse,
  GetDataSourceParameters,
  UpdateDataSourceBody,
  UpdateDataSourceResponse,
  UpdateDataSourceParameters,
} from '@/types/api';
import {
  getDataSourceParametersSchema,
  updateDataSourceBodySchema,
  updateDataSourceParametersSchema,
} from '@/types/api';

export const GET = apiRoute<GetDataSourceResponse, undefined, GetDataSourceParameters>(
  {
    expectedParamsSchema: getDataSourceParametersSchema,
  },
  async ({ params }, session) => {
    const containerRepository = await getContainerRepository();
    const dataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'data-source')
    );

    if (!dataSource) {
      throw new Error('Data source not found');
    }

    return {
      id: dataSource.id,
      name: dataSource.name,
      createdAt: dataSource.createdAt,
      lastUpdated: dataSource.lastUpdated,
    };
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

    // Verify the data source exists and belongs to the user
    const existingDataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'data-source')
    );

    if (!existingDataSource) {
      throw new Error('Data source not found');
    }

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
    } satisfies UpdateDataSourceResponse;
  }
);
