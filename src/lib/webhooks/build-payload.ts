import { getUploadedFileRepository } from '@/lib/database';
import type {
  DataSourceContainer,
  PageContainer,
  WebhookDeliveryEvent,
  WebhookPayload,
  WebhookRawValue,
} from '@/types/database';
import type { Column, PageValue } from '@/types/schemas/entities/container';

export type ValueChangeInput = Record<string, { previous: PageValue | null; new: PageValue | null }>;

/**
 * Resolves a stored `PageValue` to the primitive the payload should carry: for `single-select`,
 * the option's `label` (or `null` if unset/the option no longer exists); for `multi-select`, an
 * array of option labels (stale/deleted ids are filtered out); for `file`, a resolved
 * `{ id, filename, url }` object (`filenamesById` is pre-loaded once per payload since resolving
 * a filename requires a database lookup — see `buildPayload`); otherwise the raw `.value`. The
 * single place internal option ids are turned into human-readable labels.
 */
function toDisplayValue(
  column: Column,
  value: PageValue | null | undefined,
  filenamesById: Map<string, string | null>
): WebhookRawValue {
  if (!value) {
    return null;
  }
  if (column.type === 'single-select' && value.type === 'single-select') {
    if (!value.value) {
      return null;
    }
    const option = column.options.find((candidate) => candidate.id === value.value);
    return option?.label ?? null;
  }
  if (column.type === 'multi-select' && value.type === 'multi-select') {
    const optionsById = new Map(column.options.map((option) => [option.id, option] as const));
    return value.value.map((optionId) => optionsById.get(optionId)?.label).filter((label) => label !== undefined);
  }
  if (column.type === 'file' && value.type === 'file') {
    if (!value.value) {
      return null;
    }
    return {
      id: value.value,
      // `undefined` (id never collected) and `null` (collected but the file no longer exists)
      // both fall back to `null` here — the payload only ever carries `string | null`.
      filename: filenamesById.get(value.value) ?? null,
      url: `/api/v1/files/${value.value}/content`,
    };
  }
  if ('value' in value) {
    return value.value;
  }
  return null;
}

/** Collects every distinct non-null `file` column value id referenced across `values` and
 * `valueChanges`, so their filenames can be batch-resolved once per payload rather than one
 * query per cell. */
function collectFileValueIds(
  columnsById: Map<string, Column>,
  values: Record<string, PageValue> | undefined,
  valueChanges: ValueChangeInput | undefined
): string[] {
  const ids = new Set<string>();

  const collectFrom = (columnId: string, value: PageValue | null | undefined) => {
    const column = columnsById.get(columnId);
    if (column?.type === 'file' && value?.type === 'file' && value.value) {
      ids.add(value.value);
    }
  };

  for (const [columnId, value] of Object.entries(values ?? {})) {
    collectFrom(columnId, value);
  }
  for (const [columnId, change] of Object.entries(valueChanges ?? {})) {
    collectFrom(columnId, change.previous);
    collectFrom(columnId, change.new);
  }

  return [...ids];
}

/**
 * Assembles the outbound webhook body — the single place internal column ids/option ids are
 * resolved to human-readable column names/option labels. `values`/`dataSourceId` are only
 * included when `dataSource` is supplied; `changes` only when `valueChanges` is supplied. Async
 * because `file` values require a batch lookup of `uploaded-file.filename` (see
 * `collectFileValueIds`/`toDisplayValue`).
 * Columns no longer present on the data source are silently skipped.
 */
export async function buildPayload(
  event: WebhookDeliveryEvent,
  deliveryId: string,
  workspaceId: string,
  appId: string,
  container: PageContainer,
  dataSource?: DataSourceContainer,
  valueChanges?: ValueChangeInput
): Promise<WebhookPayload> {
  const payload: WebhookPayload = {
    event,
    deliveryId,
    timestamp: new Date().toISOString(),
    workspaceId,
    appId,
    page: {
      id: container.id,
      name: container.name,
      parentId: container.parentId ?? null,
      type: 'page',
      lastUpdated: container.lastUpdated,
    },
  };

  if (!dataSource) {
    return payload;
  }

  payload.dataSourceId = dataSource.id;

  const columnsById = new Map(dataSource.columns.map((column) => [column.id, column] as const));

  const fileIds = collectFileValueIds(columnsById, container.values, valueChanges);
  const filenamesById = new Map<string, string | null>();
  if (fileIds.length > 0) {
    const uploadedFileRepository = await getUploadedFileRepository();
    const files = await uploadedFileRepository.getByQuery(
      uploadedFileRepository.createQuery().in('id', fileIds)
    );
    const filesById = new Map(files.map((file) => [file.id, file] as const));
    for (const fileId of fileIds) {
      filenamesById.set(fileId, filesById.get(fileId)?.filename ?? null);
    }
  }

  const values: Record<string, WebhookRawValue> = {};
  for (const [columnId, value] of Object.entries(container.values ?? {})) {
    const column = columnsById.get(columnId);
    if (!column) {
      continue;
    }
    values[column.name] = toDisplayValue(column, value, filenamesById);
  }
  payload.values = values;

  if (valueChanges) {
    const changes: Record<string, { previous: WebhookRawValue; new: WebhookRawValue }> = {};
    for (const [columnId, change] of Object.entries(valueChanges)) {
      const column = columnsById.get(columnId);
      if (!column) {
        continue;
      }
      changes[column.name] = {
        previous: toDisplayValue(column, change.previous, filenamesById),
        new: toDisplayValue(column, change.new, filenamesById),
      };
    }
    if (Object.keys(changes).length > 0) {
      payload.changes = changes;
    }
  }

  return payload;
}
