import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { z } from 'zod';
import { Column, columnSchema } from '@/types/schemas/entities/container';
import { randomUUID } from 'node:crypto';
import { DataSourceContainer } from '@/types/database';

const createColumnBodySchema = z.object({
  name: z.string().min(1),
  type: z.union([z.literal('string'), z.literal('number'), z.literal('boolean')]),
});

export const POST = apiRoute<
  z.infer<typeof columnSchema>,
  undefined,
  { id: string },
  z.infer<typeof createColumnBodySchema>
>({ expectedBodySchema: createColumnBodySchema }, async ({ body, params }, session) => {
  const containerRepository = await getContainerRepository();
  const dataSource = await containerRepository.getOneByQuery(
    addUserIdToQuery(containerRepository.createQuery().eq('id', params.id), session.user.id).eq('type', 'data-source')
  );

  if (!dataSource || dataSource.type !== 'data-source') {
    throw new NotFoundError('Data source not found', true);
  }

  const newColumn: Column = { id: randomUUID(), name: body.name, type: body.type };
  await containerRepository.update({
    ...dataSource,
    columns: [...(dataSource.columns ?? []), newColumn],
    lastUpdated: new Date().toISOString(),
  } satisfies DataSourceContainer);

  return newColumn;
});
