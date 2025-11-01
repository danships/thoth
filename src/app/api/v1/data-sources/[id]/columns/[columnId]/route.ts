import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type {
  UpdateDataSourceColumnBody,
  UpdateDataSourceColumnParameters,
  UpdateDataSourceColumnResponse,
} from '@/types/api';
import { updateDataSourceColumnBodySchema, updateDataSourceColumnParametersSchema } from '@/types/api';

export const PATCH = apiRoute<
  UpdateDataSourceColumnResponse,
  undefined,
  UpdateDataSourceColumnParameters,
  UpdateDataSourceColumnBody
>(
  {
    expectedBodySchema: updateDataSourceColumnBodySchema,
    expectedParamsSchema: updateDataSourceColumnParametersSchema,
  },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();
    const dataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'data-source')
    );

    if (!dataSource || dataSource.type !== 'data-source') {
      throw new NotFoundError('Data source not found', true);
    }

    const columns = [...(dataSource.columns ?? [])];
    const foundColumn = columns.find((column) => column.id === params.columnId);
    if (!foundColumn) {
      throw new NotFoundError('Column not found', true);
    }

    const updatedColumn: typeof foundColumn = { ...foundColumn, ...body } as typeof foundColumn;
    const updatedColumns = columns.map((column) => (column.id === params.columnId ? updatedColumn : column));

    await containerRepository.update({
      ...dataSource,
      columns: updatedColumns,
      lastUpdated: new Date().toISOString(),
    });
    return updatedColumn;
  }
);

export const DELETE = apiRoute<void, undefined, UpdateDataSourceColumnParameters>(
  {
    expectedParamsSchema: updateDataSourceColumnParametersSchema,
  },
  async ({ params }, session) => {
    const containerRepository = await getContainerRepository();
    const dataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'data-source')
    );

    if (!dataSource || dataSource.type !== 'data-source') {
      throw new NotFoundError('Data source not found', true);
    }

    const nextColumns = (dataSource.columns ?? []).filter((c) => c.id !== params.columnId);
    if (nextColumns.length === (dataSource.columns ?? []).length) {
      throw new NotFoundError('Column not found', true);
    }

    await containerRepository.update({ ...dataSource, columns: nextColumns, lastUpdated: new Date().toISOString() });
  }
);
