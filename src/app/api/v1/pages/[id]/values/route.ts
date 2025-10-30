import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { pageValueSchema } from '@/types/schemas/entities/container';
import { z } from 'zod';

const bodySchema = z.record(z.string(), pageValueSchema);

export const PATCH = apiRoute<void, undefined, { id: string }, z.infer<typeof bodySchema>>(
  { expectedBodySchema: bodySchema },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();
    const page = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'page')
    );

    if (!page || page.type !== 'page') {
      throw new NotFoundError('Page not found', true);
    }

    if (!page.parentId) {
      throw new BadRequestError('Page does not have a data source parent');
    }

    const dataSource = await containerRepository.getOneByQuery(
      addUserIdToQuery(containerRepository.createQuery().eq('id', page.parentId), session.user.id).eq(
        'type',
        'data-source'
      )
    );

    if (!dataSource || dataSource.type !== 'data-source') {
      throw new NotFoundError('Parent data source not found', true);
    }

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
