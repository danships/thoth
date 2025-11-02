import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
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
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);

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

    // Verify the data source exists and belongs to the user
    const existingDataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);

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
