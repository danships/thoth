import type { Column, PageValue, WebhookRawValue } from '@thoth/database';

export type DisplayValue = WebhookRawValue;

/** Collects every distinct non-null `file` column value id referenced across values/change sets. */
export function collectFileValueIds(
  columnsById: Map<string, Column>,
  values: Record<string, PageValue> | undefined,
  valueChanges?: Record<string, { previous: PageValue | null; new: PageValue | null }>
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

/** Resolves a stored `PageValue` to the human-readable value used by payload consumers. */
export function toDisplayValue(
  column: Column,
  value: PageValue | null | undefined,
  filenamesById: Map<string, string | null>
): DisplayValue {
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
      filename: filenamesById.get(value.value) ?? null,
      url: `/api/v1/files/${value.value}/content`,
    };
  }
  if ('value' in value) {
    return value.value;
  }
  return null;
}
