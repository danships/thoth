import { BadRequestError } from '../../errors/bad-request-error';
import type { Column } from '@/types/schemas/entities/container';
import {
  NAME_SORT_COLUMN_ID,
  OPERATORS_BY_COLUMN_TYPE,
  SYSTEM_COLUMN_IDS,
  SYSTEM_COLUMN_OPERATORS,
  VALUELESS_OPERATORS,
  type FilterRule,
  type SortRule,
  type SystemColumnId,
} from '@/types/schemas/entities/data-view-query';

function isSystemColumnId(columnId: string): columnId is SystemColumnId {
  return (SYSTEM_COLUMN_IDS as readonly string[]).includes(columnId);
}

/**
 * Validates that every filter/sort rule's `columnId` exists in `columns` and, for filters, that
 * `operator` is valid for that column's `type`. Throws `BadRequestError` — used by route
 * handlers validating a client-supplied `PATCH /views/:id` body or inline `GET /pages` override,
 * where an invalid rule should fail loudly (400) rather than be silently dropped.
 *
 * `createdAt`/`lastUpdated` (THOTH-078) are fixed `Container` attributes, not Data Source
 * columns, so they're validated against `SYSTEM_COLUMN_OPERATORS` instead of `columns`.
 */
export function assertValidFilterSortRules(columns: Column[], filters: FilterRule[], sorts: SortRule[]): void {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  for (const filter of filters) {
    if (isSystemColumnId(filter.columnId)) {
      if (!SYSTEM_COLUMN_OPERATORS.includes(filter.operator)) {
        throw new BadRequestError(`Operator "${filter.operator}" is not valid for column "${filter.columnId}"`);
      }
      if (filter.value === undefined) {
        throw new BadRequestError(`Filter on column "${filter.columnId}" requires a value`);
      }
      continue;
    }
    const column = columnsById.get(filter.columnId);
    if (!column) {
      throw new BadRequestError(`Unknown columnId in filter: ${filter.columnId}`);
    }
    if (!OPERATORS_BY_COLUMN_TYPE[column.type].includes(filter.operator)) {
      throw new BadRequestError(`Operator "${filter.operator}" is not valid for column type "${column.type}"`);
    }
    if (!VALUELESS_OPERATORS.has(filter.operator) && filter.value === undefined) {
      throw new BadRequestError(`Filter on column "${filter.columnId}" requires a value`);
    }
    if ((filter.operator === 'hasAnyOf' || filter.operator === 'hasAllOf') && !Array.isArray(filter.value)) {
      throw new BadRequestError(`Filter operator "${filter.operator}" requires an array value`);
    }
  }

  for (const sort of sorts) {
    // `NAME_SORT_COLUMN_ID`/system column ids sort on a fixed `Container` attribute (THOTH-065/
    // THOTH-078), not a Data Source column, so they're always valid regardless of `columns`.
    if (sort.columnId !== NAME_SORT_COLUMN_ID && !isSystemColumnId(sort.columnId) && !columnsById.has(sort.columnId)) {
      throw new BadRequestError(`Unknown columnId in sort: ${sort.columnId}`);
    }
  }
}

/**
 * Filters out filter/sort rules referencing a `columnId` no longer present in `columns` (e.g.
 * the column was deleted, or an operator no longer valid after the column's `type` changed).
 * Used by `executePageQuery` so a stale rule degrades to "ignored" rather than 500ing (THOTH-037
 * Edge Cases: "Column deleted after a filter/sort references it").
 */
export function dropStaleRules(
  columns: Column[],
  filters: FilterRule[],
  sorts: SortRule[]
): { filters: FilterRule[]; sorts: SortRule[]; droppedFilters: FilterRule[]; droppedSorts: SortRule[] } {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  const validFilters: FilterRule[] = [];
  const droppedFilters: FilterRule[] = [];
  for (const filter of filters) {
    // System-column rules (THOTH-078) are never stale — the field always exists on every
    // `Container` — but an invalid operator (e.g. after a hand-crafted persisted rule) still
    // degrades to "ignored", mirroring the type-mismatch case for a real column below.
    if (isSystemColumnId(filter.columnId)) {
      if (SYSTEM_COLUMN_OPERATORS.includes(filter.operator)) {
        validFilters.push(filter);
      } else {
        droppedFilters.push(filter);
      }
      continue;
    }
    const column = columnsById.get(filter.columnId);
    if (column && OPERATORS_BY_COLUMN_TYPE[column.type].includes(filter.operator)) {
      validFilters.push(filter);
    } else {
      droppedFilters.push(filter);
    }
  }

  const validSorts: SortRule[] = [];
  const droppedSorts: SortRule[] = [];
  for (const sort of sorts) {
    if (sort.columnId === NAME_SORT_COLUMN_ID || isSystemColumnId(sort.columnId) || columnsById.has(sort.columnId)) {
      validSorts.push(sort);
    } else {
      droppedSorts.push(sort);
    }
  }

  return { filters: validFilters, sorts: validSorts, droppedFilters, droppedSorts };
}
