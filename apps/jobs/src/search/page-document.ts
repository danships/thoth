import { getUploadedFileRepository, type DataSourceContainer, type PageContainer } from '@thoth/database';
import { stringify as stringifyYaml } from 'yaml';
import { collectFileValueIds, toDisplayValue } from '../page-values/display-values.js';

export function isPageSearchEligible(page: { type: string; deletedAt: string | null; isPrivate?: boolean }): boolean {
  return page.type === 'page' && page.deletedAt === null && page.isPrivate !== true;
}

function buildColumnKeys(columns: DataSourceContainer['columns']): Map<string, string> {
  const counts = new Map<string, number>();
  for (const column of columns) {
    counts.set(column.name, (counts.get(column.name) ?? 0) + 1);
  }

  return new Map(
    columns.map((column) => [
      column.id,
      (counts.get(column.name) ?? 0) > 1 ? `${column.name} [${column.id}]` : column.name,
    ])
  );
}

function normalizeDocumentValue(value: ReturnType<typeof toDisplayValue>): string | number | boolean | string[] | undefined {
  if (value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'object') {
    return value.filename ?? undefined;
  }
  return value;
}

export async function buildPageSearchDocument(page: PageContainer, dataSource?: DataSourceContainer): Promise<string> {
  const sections: string[] = [];

  if (dataSource) {
    const columnsById = new Map(dataSource.columns.map((column) => [column.id, column] as const));
    const columnKeys = buildColumnKeys(dataSource.columns);
    const filenamesById = new Map<string, string | null>();
    const fileIds = collectFileValueIds(columnsById, page.values);

    if (fileIds.length > 0) {
      const uploadedFileRepository = await getUploadedFileRepository();
      const files = await uploadedFileRepository.getByQuery(uploadedFileRepository.createQuery().in('id', fileIds));
      const filesById = new Map(files.map((file) => [file.id, file] as const));
      for (const fileId of fileIds) {
        filenamesById.set(fileId, filesById.get(fileId)?.filename ?? null);
      }
    }

    const values: Record<string, string | number | boolean | string[]> = {};
    for (const column of dataSource.columns) {
      const rawValue = page.values?.[column.id];
      const displayValue = normalizeDocumentValue(toDisplayValue(column, rawValue, filenamesById));
      if (displayValue === undefined) {
        continue;
      }
      values[columnKeys.get(column.id) ?? column.name] = displayValue;
    }

    if (Object.keys(values).length > 0) {
      sections.push(`---\n${stringifyYaml({ values }).trimEnd()}\n---`);
    }
  }

  sections.push(`# ${page.name}\n\n${page.content ?? ''}`);
  return sections.join('\n');
}
