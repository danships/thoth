import { randomUUID } from 'node:crypto';
import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type {
  CreateSingleSelectOptionBody,
  CreateSingleSelectOptionParameters,
  CreateSingleSelectOptionResponse,
} from '@/types/api';
import { createSingleSelectOptionBodySchema, createSingleSelectOptionParametersSchema } from '@/types/api';

export const POST = apiRoute<
  CreateSingleSelectOptionResponse,
  undefined,
  CreateSingleSelectOptionParameters,
  CreateSingleSelectOptionBody
>(
  {
    expectedBodySchema: createSingleSelectOptionBodySchema,
    expectedParamsSchema: createSingleSelectOptionParametersSchema,
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

    if (foundColumn.type !== 'single-select') {
      throw new BadRequestError('Column is not a single-select column');
    }

    const normalizedLabel = body.label.trim().toLowerCase();
    if (!normalizedLabel) {
      throw new BadRequestError('Option label is required');
    }

    // Idempotent on a case-insensitive label match — return the existing option rather than
    // erroring or duplicating, so a client racing another creator of the same label is safe.
    const existingOption = foundColumn.options.find((option) => option.label.trim().toLowerCase() === normalizedLabel);
    if (existingOption) {
      return existingOption;
    }

    const newOption = { id: randomUUID(), label: body.label.trim(), color: body.color };
    const updatedColumn = { ...foundColumn, options: [...foundColumn.options, newOption] };
    const updatedColumns = columns.map((column) => (column.id === params.columnId ? updatedColumn : column));

    await containerRepository.update({
      ...dataSource,
      columns: updatedColumns,
      lastUpdated: new Date().toISOString(),
    });

    return newOption;
  }
);
