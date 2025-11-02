import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
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

    const newColumn: Column = { id: randomUUID(), name: body.name, type: body.type };
    await containerRepository.update({
      ...dataSource,
      columns: [...(dataSource.columns ?? []), newColumn],
      lastUpdated: new Date().toISOString(),
    } satisfies DataSourceContainer);

    return newColumn;
  }
);
