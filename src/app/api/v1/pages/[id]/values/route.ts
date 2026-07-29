import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { pageRetriever } from '@/lib/database/retrievers/page-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { scheduleNotifyPageChange } from '@/lib/webhooks/notify-service';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { UpdatePageValuesParameters, updatePageValuesParametersSchema } from '@/types/api';
import { pageValueSchema } from '@/types/schemas/entities/container';
import type { PageValue } from '@/types/schemas/entities/container';
import type { ValueChangeInput } from '@/lib/webhooks/notify-service';
import { z } from 'zod';

const bodySchema = z.record(z.string(), pageValueSchema);

export const PATCH = apiRoute<void, undefined, UpdatePageValuesParameters, z.infer<typeof bodySchema>>(
  { expectedBodySchema: bodySchema, expectedParamsSchema: updatePageValuesParametersSchema },
  async ({ body, params }, session) => {
    const containerRepository = await getContainerRepository();
    const page = await pageRetriever.retrievePage(params.id, session.user.id);
    await assertGrantAllowsContainerForSession(session, page);

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
      if (column.type === 'single-select' && value.type === 'single-select' && value.value !== null) {
        const validOptionIds = new Set(column.options.map((option) => option.id));
        if (!validOptionIds.has(value.value)) {
          throw new BadRequestError(`Unknown option for column: ${columnId}`);
        }
      }
    }

    const mergedValues = { ...page.values, ...body };

    // Capture the raw before/after `PageValue`s (keyed by column id) for changed columns only —
    // `notifyPageChange`/`buildPayload` resolves column-id -> name and single-select id -> label
    // centrally, so this stays a dumb diff.
    const valueChanges: ValueChangeInput = {};
    for (const [columnId, newValue] of Object.entries(body)) {
      const previousValue: PageValue | null = page.values?.[columnId] ?? null;
      if (JSON.stringify(previousValue) !== JSON.stringify(newValue)) {
        valueChanges[columnId] = { previous: previousValue, new: newValue };
      }
    }

    const updatedPage = await containerRepository.update({
      ...page,
      values: mergedValues,
      lastUpdated: new Date().toISOString(),
    });

    scheduleNotifyPageChange(
      'page.updated',
      updatedPage,
      { appId: session.appContext?.appId },
      Object.keys(valueChanges).length > 0 ? { valueChanges } : undefined
    );
  }
);
