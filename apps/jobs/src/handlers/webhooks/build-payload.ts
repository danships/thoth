import {
  getUploadedFileRepository,
  type DataSourceContainer,
  type PageContainer,
  type PageValue,
  type WebhookDeliveryEvent,
  type WebhookPayload,
  type WebhookRawValue,
} from '@thoth/database';
import { collectFileValueIds, toDisplayValue } from '../../page-values/display-values.js';

export type ValueChangeInput = Record<string, { previous: PageValue | null; new: PageValue | null }>;

/**
 * Assembles the outbound webhook body (moved from `apps/web` in THOTH-061 — dispatch now reads
 * the current page/data-source snapshot inside this process) — the single place internal
 * column ids/option ids are resolved to human-readable column names/option labels.
 * `values`/`dataSourceId` are only included when `dataSource` is supplied; `changes` only when
 * `valueChanges` is supplied. Async because `file` values require a batch lookup of
 * `uploaded-file.filename` (see `collectFileValueIds`/`toDisplayValue`). Columns no longer
 * present on the data source are silently skipped.
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
    const files = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery().in('id', fileIds));
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
