import { randomUUID } from 'node:crypto';
import { apiRoute } from '@/lib/api/route-wrapper';
import { getContainerRepository } from '@/lib/database';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { BadRequestError } from '@/lib/errors/bad-request-error';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { ConflictError } from '@/lib/errors/conflict-error';
import type {
  CreateSingleSelectOptionBody,
  CreateSingleSelectOptionParameters,
  CreateSingleSelectOptionResponse,
} from '@/types/api';
import { createSingleSelectOptionBodySchema, createSingleSelectOptionParametersSchema } from '@/types/api';
import type { DataSourceContainer } from '@/types/database';

// supersave's repository has no built-in optimistic-concurrency/CAS support (no version/etag
// column, and `update()` replaces the full row) — so two concurrent creators can both read the
// same stale `columns` snapshot, and the later `update()` can silently overwrite the earlier
// append. We mitigate this with a verify-after-write retry loop: after each write, re-fetch the
// freshest row and confirm the new option actually persisted; if it didn't (because a
// concurrent write clobbered it), reload the latest state and retry the whole
// idempotency-check-then-append from scratch.
const MAX_CREATE_ATTEMPTS = 5;

async function fetchDataSource(
  containerRepository: Awaited<ReturnType<typeof getContainerRepository>>,
  id: string
): Promise<DataSourceContainer> {
  const dataSource = await containerRepository.getOneByQuery(
    containerRepository.createQuery().eq('id', id).eq('type', 'data-source')
  );

  if (!dataSource || dataSource.type !== 'data-source') {
    throw new NotFoundError('Data source not found', true);
  }

  return dataSource;
}

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

    const normalizedLabel = body.label.trim().toLowerCase();
    if (!normalizedLabel) {
      throw new BadRequestError('Option label is required');
    }

    // Authorize once up front — the data source's `workspaceId` never changes across the
    // retry loop below, so there's no need to re-check it on every attempt.
    const initialDataSource = await fetchDataSource(containerRepository, params.id);
    await assertWorkspaceAccess(session.user.id, initialDataSource.workspaceId);

    for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
      const dataSource = await fetchDataSource(containerRepository, params.id);
      const columns = [...(dataSource.columns ?? [])];
      const foundColumn = columns.find((column) => column.id === params.columnId);
      if (!foundColumn) {
        throw new NotFoundError('Column not found', true);
      }

      if (foundColumn.type !== 'single-select') {
        throw new BadRequestError('Column is not a single-select column');
      }

      // Idempotent on a case-insensitive label match — return the existing option rather than
      // erroring or duplicating, so a client racing another creator of the same label is safe.
      const existingOption = foundColumn.options.find(
        (option) => option.label.trim().toLowerCase() === normalizedLabel
      );
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

      // Verify the write actually stuck — a concurrent creator could have read the same stale
      // snapshot and overwritten this append with its own full-array replace.
      const persisted = await fetchDataSource(containerRepository, params.id);
      const persistedColumn = (persisted.columns ?? []).find((column) => column.id === params.columnId);
      const persistedOption =
        persistedColumn?.type === 'single-select'
          ? persistedColumn.options.find((option) => option.id === newOption.id)
          : undefined;

      if (persistedOption) {
        return persistedOption;
      }
      // Lost the race — loop around, re-fetch the latest state, and retry.
    }

    throw new ConflictError('Failed to create option due to concurrent updates, please try again');
  }
);
