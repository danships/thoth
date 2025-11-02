import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { UpdatePageValuesParameters, updatePageValuesParametersSchema } from '@/types/api';
import { pageValueSchema } from '@/types/schemas/entities/container';
import { z } from 'zod';

const bodySchema = z.record(z.string(), pageValueSchema);

export const PATCH = apiRoute<void, undefined, UpdatePageValuesParameters, z.infer<typeof bodySchema>>(
  { expectedBodySchema: bodySchema, expectedParamsSchema: updatePageValuesParametersSchema },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();
    const page = await pageRetriever.retrievePage(params.id, session.user.id);

    if (!page.parentId) {
      throw new BadRequestError('Page does not have a data source parent');
    }

    const dataSource = await dataSourceRetriever.retrieveDataSource(page.parentId, session.user.id);

    const columns = dataSource.columns ?? [];
    const columnMap = new Map(columns.map((c) => [c.id, c] as const));

    // Validate that provided keys match existing columns and types
    for (const [columnId, value] of Object.entries(body)) {
      const column = columnMap.get(columnId);
      if (!column) {
        throw new BadRequestError(`Unknown column: ${columnId}`);
      }
      if (column.type !== value.type) {
        throw new BadRequestError(`Type mismatch for column: ${columnId}`);
      }
    }

    const mergedValues = { ...page.values, ...body };
    await containerRepository.update({
      ...page,
      values: mergedValues,
      lastUpdated: new Date().toISOString(),
    });
  }
);
