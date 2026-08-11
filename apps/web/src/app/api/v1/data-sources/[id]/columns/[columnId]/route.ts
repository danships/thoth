import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { dataSourceRetriever } from '@/lib/database/retrievers/data-source-retriever';
import { assertGrantAllowsContainerForSession } from '@/lib/auth/access-grant';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { extractFileIdsFromContent, extractFileIdsFromValues, syncFileUsageForPage } from '@/lib/files/usage';
import { getLogger } from '@/lib/logger';
import type {
  UpdateDataSourceColumnBody,
  UpdateDataSourceColumnParameters,
  UpdateDataSourceColumnResponse,
} from '@/types/api';
import { updateDataSourceColumnBodySchema, updateDataSourceColumnParametersSchema } from '@/types/api';
import type { PageContainer } from '@thoth/database/types';
import type { Column } from '@/types/schemas/entities/container';
import type { ApiKeySession } from '@/lib/auth/session';
import { after } from 'next/server';

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

    const deletedColumn = (dataSource.columns ?? []).find((c) => c.id === params.columnId);
    const nextColumns = (dataSource.columns ?? []).filter((c) => c.id !== params.columnId);
    if (!deletedColumn) {
      throw new NotFoundError('Column not found', true);
    }

    await containerRepository.update({ ...dataSource, columns: nextColumns, lastUpdated: new Date().toISOString() });

    // A `file` column's cell values are the *only* thing that can reference a file id in
    // `page.values` (THOTH-054) — deleting the column orphans that reference. Reconcile every
    // child page's `file-usage` against the recomputed union (which, with the column already
    // gone from `nextColumns`, no longer includes ids from the deleted column's values) so files
    // referenced only through it stop being retrievable via this data source, while files still
    // referenced by page content or another file column are preserved. No-op for non-`file`
    // columns since the union is then unchanged, so skip the per-page work entirely.
    //
    // This is scheduled via `after()` (mirroring `scheduleNotifyPageChange`) rather than awaited
    // inline: the column update above is already durably persisted, and a data source can have
    // an unbounded number of child pages — awaiting one-page-at-a-time reconciliation here would
    // risk exceeding the request timeout on a large data source. Pages are still processed in
    // bounded batches (not all at once) to cap concurrent load on the database.
    if (deletedColumn.type === 'file') {
      after(() => reconcileFileUsageAfterColumnDelete(dataSource.id, nextColumns, session));
    }
  }
);

// Bounds how many pages are reconciled concurrently within a single batch, so a data source with
// a very large number of child pages doesn't fan out an unbounded number of concurrent database
// operations at once.
const FILE_USAGE_RECONCILE_BATCH_SIZE = 25;

async function reconcileFileUsageAfterColumnDelete(
  dataSourceId: string,
  nextColumns: Column[],
  session: ApiKeySession
): Promise<void> {
  const containerRepository = await getContainerRepository();
  const logger = await getLogger();

  try {
    const childPages = (await containerRepository.getByQuery(
      containerRepository.createQuery().eq('parentId', dataSourceId).eq('type', 'page')
    )) as PageContainer[];

    for (let index = 0; index < childPages.length; index += FILE_USAGE_RECONCILE_BATCH_SIZE) {
      const batch = childPages.slice(index, index + FILE_USAGE_RECONCILE_BATCH_SIZE);
      await Promise.all(
        batch.map(async (page) => {
          try {
            const union = new Set([
              ...extractFileIdsFromContent(page.content ?? ''),
              ...extractFileIdsFromValues(page.values, nextColumns),
            ]);
            await syncFileUsageForPage(page.id, session, [...union]);
          } catch (error) {
            logger.error('data-source-columns.delete.sync-file-usage-failed', { pageId: page.id, error });
          }
        })
      );
    }
  } catch (error) {
    logger.error('data-source-columns.delete.sync-file-usage-batch-failed', { dataSourceId, error });
  }
}
