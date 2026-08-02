import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { BadRequestError } from '@/lib/errors/bad-request-error';
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
    // Pattern P: fetched by id via the retriever (workspace membership asserted on the row's
    // own workspaceId), not gated by creator (THOTH-042).
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource, { mutating: true });

    const columns = [...(dataSource.columns ?? [])];
    const foundColumn = columns.find((column) => column.id === params.columnId);
    if (!foundColumn) {
      throw new NotFoundError('Column not found', true);
    }

    if ('type' in body && (body.type === 'single-select' || body.type === 'multi-select') && body.options) {
      const seenLabels = new Set<string>();
      for (const option of body.options) {
        const normalizedLabel = option.label.trim().toLowerCase();
        if (!normalizedLabel) {
          throw new BadRequestError('Option label is required');
        }
        if (seenLabels.has(normalizedLabel)) {
          throw new BadRequestError(`Duplicate option label: ${option.label}`);
        }
        seenLabels.add(normalizedLabel);
      }
    }

    // Trim option labels before persisting so whitespace-padded input doesn't get stored verbatim.
    const normalizedBody =
      'type' in body && (body.type === 'single-select' || body.type === 'multi-select') && body.options
        ? { ...body, options: body.options.map((option) => ({ ...option, label: option.label.trim() })) }
        : body;

    const updatedColumn: typeof foundColumn = { ...foundColumn, ...normalizedBody } as typeof foundColumn;
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
    // Pattern P: fetched by id via the retriever (workspace membership asserted on the row's
    // own workspaceId), not gated by creator (THOTH-042).
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource, { mutating: true });

    const nextColumns = (dataSource.columns ?? []).filter((c) => c.id !== params.columnId);
    if (nextColumns.length === (dataSource.columns ?? []).length) {
      throw new NotFoundError('Column not found', true);
    }

    await containerRepository.update({ ...dataSource, columns: nextColumns, lastUpdated: new Date().toISOString() });
  }
);
