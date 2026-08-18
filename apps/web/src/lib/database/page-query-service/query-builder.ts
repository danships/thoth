import type { PageQueryEngineAdapter } from './adapter';
import { jsonPath, likePattern } from './shared';
import type { SqlFragment } from './types';
import type { Column } from '@/types/schemas/entities/container';
import { BadRequestError } from '../../errors/bad-request-error';
import type { FilterRule } from '@/types/schemas/entities/data-view-query';

/** Builds the WHERE-clause SQL fragment for a single filter rule against `column`, delegating
 * every engine-specific dialect difference (JSON extraction, array length, collation, `hasAnyOf`/
 * `hasAllOf`) to `adapter`. Shared between all engines — see `adapter.ts` for the abstraction
 * this replaces (THOTH-037 review feedback). */
export function buildFilterFragment(adapter: PageQueryEngineAdapter, column: Column, filter: FilterRule): SqlFragment {
  const path = jsonPath(filter.columnId);
  const isString = column.type === 'string';
  const collate = isString ? adapter.stringCollation() : '';
  const value = adapter.normalizeFilterValue(filter.value);
  const extract = adapter.extractExpression();
  const extractRaw = adapter.extractRawExpression();

  switch (filter.operator) {
    case 'isEmpty': {
      if (column.type === 'multi-select') {
        return {
          sql: `(${extractRaw} IS NULL OR ${adapter.arrayLengthExpression(extractRaw)} = 0)`,
          params: [path, path],
        };
      }
      return { sql: `(${extract} IS NULL OR ${extract} = '')`, params: [path, path] };
    }
    case 'isNotEmpty': {
      if (column.type === 'multi-select') {
        return {
          sql: `(${extractRaw} IS NOT NULL AND ${adapter.arrayLengthExpression(extractRaw)} > 0)`,
          params: [path, path],
        };
      }
      return { sql: `(${extract} IS NOT NULL AND ${extract} != '')`, params: [path, path] };
    }
    case 'equals': {
      // Boolean columns need engine-specific NULL/type handling (a never-touched checkbox should
      // filter the same as an explicit `false` — see `buildBooleanEquals`), so they don't go
      // through the generic `extract = ?` comparison used by every other column type.
      if (column.type === 'boolean') {
        return adapter.buildBooleanEquals(path, filter.value === true);
      }
      return { sql: `${extract}${collate} = ?`, params: [path, value] };
    }
    case 'notEquals': {
      if (column.type === 'boolean') {
        const equalsFragment = adapter.buildBooleanEquals(path, filter.value === true);
        return { sql: `NOT (${equalsFragment.sql})`, params: equalsFragment.params };
      }
      return { sql: `(${extract} IS NULL OR ${extract}${collate} != ?)`, params: [path, path, value] };
    }
    case 'contains': {
      return { sql: String.raw`${extract}${collate} LIKE ? ESCAPE '\'`, params: [path, likePattern(value)] };
    }
    case 'notContains': {
      return {
        sql: String.raw`(${extract} IS NULL OR ${extract}${collate} NOT LIKE ? ESCAPE '\')`,
        params: [path, path, likePattern(value)],
      };
    }
    case 'gt': {
      return { sql: `${extract} > ?`, params: [path, value] };
    }
    case 'gte': {
      return { sql: `${extract} >= ?`, params: [path, value] };
    }
    case 'lt': {
      return { sql: `${extract} < ?`, params: [path, value] };
    }
    case 'lte': {
      return { sql: `${extract} <= ?`, params: [path, value] };
    }
    case 'hasAnyOf': {
      const ids = Array.isArray(filter.value) ? filter.value : [];
      return adapter.buildHasAnyOf(path, ids);
    }
    case 'hasAllOf': {
      const ids = Array.isArray(filter.value) ? filter.value : [];
      return adapter.buildHasAllOf(path, ids);
    }
    default: {
      throw new BadRequestError(`Unsupported filter operator: ${filter.operator as string}`);
    }
  }
}

/** Builds the ORDER-BY expression for sorting by `column`, applying the engine's string
 * collation where relevant. */
export function buildSortExpression(adapter: PageQueryEngineAdapter, column: Column): SqlFragment {
  const path = jsonPath(column.id);
  const collate = column.type === 'string' ? adapter.stringCollation() : '';
  return { sql: `${adapter.extractExpression()}${collate}`, params: [path] };
}

/** Builds the ORDER-BY expression for sorting by a page's own `name` (THOTH-065), a fixed
 * `Container` attribute rather than a dynamic Data Source column. Unlike `buildSortExpression`,
 * this reads a real generated/indexed `name` column on the `container` table directly (see the
 * `Container` entity's `filterSortFields`) rather than `json_extract`-ing into `contents` —
 * mirroring how `parentId`/`type`/etc. are already referenced as plain columns elsewhere in this
 * query. Always string-collated the same way an ordinary `string` column's sort is. */
export function buildNameSortExpression(adapter: PageQueryEngineAdapter): SqlFragment {
  return { sql: `name${adapter.stringCollation()}`, params: [] };
}
