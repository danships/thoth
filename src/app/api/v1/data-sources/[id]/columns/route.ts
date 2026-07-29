/* eslint-disable unicorn/no-nested-ternary */
import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { z } from 'zod';
import { Column, columnSchema } from '@/types/schemas/entities/container';
import { randomUUID } from 'node:crypto';
import { DataSourceContainer } from '@/types/database';
import { CreateDataSourceColumnBody, createDataSourceColumnBodySchema } from '@/types/api';

export const POST = apiRoute<z.infer<typeof columnSchema>, undefined, { id: string }, CreateDataSourceColumnBody>(
  { expectedBodySchema: createDataSourceColumnBodySchema },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();
    const dataSource = await dataSourceRetriever.retrieveDataSource(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, dataSource);

    const newColumn: Column =
      body.type === 'date'
        ? { id: randomUUID(), name: body.name, type: body.type, mode: body.mode, displayFormat: body.displayFormat }
        : body.type === 'single-select'
          ? {
              id: randomUUID(),
              name: body.name,
              type: body.type,
              options: body.options.map((o) => ({ id: randomUUID(), label: o.label, color: o.color })),
            }
          : { id: randomUUID(), name: body.name, type: body.type };
    await containerRepository.update({
      ...dataSource,
      columns: [...(dataSource.columns ?? []), newColumn],
      lastUpdated: new Date().toISOString(),
    } satisfies DataSourceContainer);

    return newColumn;
  }
);
