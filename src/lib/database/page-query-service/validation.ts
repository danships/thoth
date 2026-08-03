import { BadRequestError } from '../../errors/bad-request-error';
import type { Column } from '@/types/schemas/entities/container';
import {
  OPERATORS_BY_COLUMN_TYPE,
  VALUELESS_OPERATORS,
  type FilterRule,
  type SortRule,
} from '@/types/schemas/entities/data-view-query';

/**
 * Validates that every filter/sort rule's `columnId` exists in `columns` and, for filters, that
 * `operator` is valid for that column's `type`. Throws `BadRequestError` — used by route
 * handlers validating a client-supplied `PATCH /views/:id` body or inline `GET /pages` override,
 * where an invalid rule should fail loudly (400) rather than be silently dropped.
 */
export function assertValidFilterSortRules(columns: Column[], filters: FilterRule[], sorts: SortRule[]): void {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  for (const filter of filters) {
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
    if (!columnsById.has(sort.columnId)) {
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
    if (columnsById.has(sort.columnId)) {
      validSorts.push(sort);
    } else {
      droppedSorts.push(sort);
    }
  }

  return { filters: validFilters, sorts: validSorts, droppedFilters, droppedSorts };
}
