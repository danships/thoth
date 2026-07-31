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
 * array of option labels (stale/deleted ids are filtered out); otherwise the raw `.value`. The
 * single place internal option ids are turned into human-readable labels.
 */
function toDisplayValue(column: Column, value: PageValue | null | undefined): WebhookRawValue {
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
  if ('value' in value) {
    return value.value;
  }
  return null;
}

/**
 * Assembles the outbound webhook body — the single place internal column ids/option ids are
 * resolved to human-readable column names/option labels. `values`/`dataSourceId` are only
 * included when `dataSource` is supplied; `changes` only when `valueChanges` is supplied.
 * Columns no longer present on the data source are silently skipped.
 */
export function buildPayload(
  event: WebhookDeliveryEvent,
  deliveryId: string,
  workspaceId: string,
  appId: string,
  container: PageContainer,
  dataSource?: DataSourceContainer,
  valueChanges?: ValueChangeInput
): WebhookPayload {
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

  const values: Record<string, WebhookRawValue> = {};
  for (const [columnId, value] of Object.entries(container.values ?? {})) {
    const column = columnsById.get(columnId);
    if (!column) {
      continue;
    }
    values[column.name] = toDisplayValue(column, value);
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
        previous: toDisplayValue(column, change.previous),
        new: toDisplayValue(column, change.new),
      };
    }
    if (Object.keys(changes).length > 0) {
      payload.changes = changes;
    }
  }

  return payload;
}
