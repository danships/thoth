import { getAdapter } from './adapter';
import { buildFilterFragment, buildSortExpression } from './query-builder';
import { dropStaleRules } from './validation';
import type { ExecutePageQueryOptions, ExecutePageQueryResult, SqlFragment } from './types';
import type { PageContainer } from '@/types/database';
import { BadRequestError } from '../../errors/bad-request-error';

export { assertValidFilterSortRules } from './validation';
export type { PageQueryCursor, ExecutePageQueryOptions, ExecutePageQueryResult } from './types';

// `OPERATORS_BY_COLUMN_TYPE`/`VALUELESS_OPERATORS` now live in the schema module (see there for
// rationale) so client components can import them without pulling in this file's server-only DB
// driver imports. Re-exported here for backward compatibility with existing importers (e.g.
// `page-query-service.test.ts`).
export { OPERATORS_BY_COLUMN_TYPE, VALUELESS_OPERATORS } from '@/types/schemas/entities/data-view-query';

/**
 * Executes a raw-SQL, cursor-paginated query for pages under `parentId`, applying `filters`
 * (AND-only) and `sorts` against the dynamic per-column values stored in `Container.values`
 * (see THOTH-037). Falls back to `createdAt asc, id asc` when no sort rules are given, and
 * always appends `id asc` as a final tiebreak for stable keyset pagination.
 *
 * Filter/sort rules referencing a `columnId` no longer in `columns` (deleted column, or a type
 * change that invalidated the operator) are silently dropped rather than causing an error.
 *
 * Engine-specific SQL dialect differences (JSON extraction, collation, array membership, etc.)
 * are delegated to a `PageQueryEngineAdapter` (see `adapter.ts`, `sqlite-adapter.ts`,
 * `mysql-adapter.ts`) rather than inlined here — this function only orchestrates filter/sort
 * building and keyset-cursor pagination, identically regardless of engine.
 */
export async function executePageQuery(options: ExecutePageQueryOptions): Promise<ExecutePageQueryResult> {
  const adapter = await getAdapter();

  const { filters, sorts } = dropStaleRules(options.columns, options.filters, options.sorts);
  const columnsById = new Map(options.columns.map((column) => [column.id, column]));

  const whereClauses: string[] = ["type = 'page'", 'deletedAt IS NULL', 'parentId = ?'];
  const whereParameters: unknown[] = [options.parentId];

  for (const filter of filters) {
    const column = columnsById.get(filter.columnId);
    if (!column) {
      continue;
    }
    const fragment = buildFilterFragment(adapter, column, filter);
    whereClauses.push(fragment.sql);
    whereParameters.push(...fragment.params);
  }

  // Sort expressions, each paired with its direction and a `valueOf` accessor (used to derive
  // cursor values from the last row of a page); always ends with a native `id asc` tiebreak for
  // deterministic, stable ordering (and keyset pagination correctness).
  const sortExpressions: {
    sql: string;
    params: unknown[];
    direction: 'asc' | 'desc';
    valueOf: (page: PageContainer) => string | number | boolean | null;
  }[] = [];
  for (const sort of sorts) {
    const column = columnsById.get(sort.columnId);
    if (!column) {
      continue;
    }
    const expression = buildSortExpression(adapter, column);
    sortExpressions.push({
      ...expression,
      direction: sort.direction,
      valueOf: (page) => {
        const raw = page.values?.[sort.columnId]?.value ?? null;
        return Array.isArray(raw) ? null : raw;
      },
    });
  }
  if (sortExpressions.length === 0) {
    sortExpressions.push({
      sql: 'createdAt',
      params: [],
      direction: 'asc',
      valueOf: (page) => page.createdAt,
    });
  }
  sortExpressions.push({ sql: 'id', params: [], direction: 'asc', valueOf: (page) => page.id });

  // Keyset pagination boundary: given sort keys k0..kn-1 (last one always `id asc`) and cursor
  // values c0..cn-1 (`options.cursor.values`, one per key in `sortExpressions` order, plus the
  // trailing `containerId`), the "rows after the cursor" condition is a standard OR/AND
  // expansion that works correctly regardless of how many keys there are or whether their
  // directions are mixed:
  //   OR over i: (AND_{j<i} kj = cj) AND (k_i OP_i c_i)     where OP_i is `>` for asc, `<` for desc
  //
  // Data-view columns are frequently empty (NULL after `json_extract`), and both SQLite and
  // MySQL order NULL as the smallest possible value regardless of `ASC`/`DESC` (NULL first for
  // ASC, NULL last for DESC — i.e. NULL always sorts as "-infinity"). A plain `kj = cj`/`ki OP ci`
  // comparison against a NULL operand evaluates to NULL/unknown in SQL and is dropped from the
  // WHERE clause, silently skipping rows or emitting an unusable cursor. `nullSafeEquals`/
  // `nullSafeAfter` below encode the same "NULL is the minimum" semantics explicitly instead.
  if (options.cursor) {
    // The trailing `id asc` tiebreak's cursor value is always `containerId`; every other key's
    // value comes from `options.cursor.values` in the same order the sort expressions were built.
    // A cursor produced for a different filter/sort configuration (e.g. the view's sorts changed
    // between pages, or `dropStaleRules` dropped a rule) would misalign values with keys — reject
    // it outright rather than silently querying with the wrong bindings.
    if (options.cursor.values.length !== sortExpressions.length - 1) {
      throw new BadRequestError('Cursor does not match the current sort configuration');
    }
    const cursorValues: unknown[] = [...options.cursor.values, options.cursor.containerId];

    // Null-safe equality: `IS` (SQLite) / `<=>` (MySQL) both compare NULL to NULL as true and
    // never evaluate to NULL/unknown, unlike `=`.
    const nullSafeEquals = (sql: string, parameter: unknown): SqlFragment => ({
      sql: `${sql} ${adapter.nullSafeEqualsOperator()} ?`,
      params: [parameter],
    });

    // Null-safe "comes after the cursor in this key's sort order", treating NULL as the minimum
    // value for both ASC and DESC (matching each engine's default NULL ordering).
    const nullSafeAfter = (sql: string, direction: 'asc' | 'desc', cursorValue: unknown): SqlFragment => {
      if (direction === 'asc') {
        // Cursor value is the minimum possible (NULL): anything non-null comes after it.
        // Otherwise, plain `>` already excludes NULL rows correctly (NULL < any real value).
        return cursorValue === null
          ? { sql: `${sql} IS NOT NULL`, params: [] }
          : { sql: `${sql} > ?`, params: [cursorValue] };
      }
      // direction === 'desc'
      if (cursorValue === null) {
        // Cursor is already at the minimum; nothing can sort after it in descending order.
        return { sql: '1 = 0', params: [] };
      }
      // NULL rows are smaller than any real value, so they still come after a non-null cursor
      // in descending order — `<` alone would otherwise silently exclude them.
      return { sql: `(${sql} IS NULL OR ${sql} < ?)`, params: [cursorValue] };
    };

    const orClauses: string[] = [];
    const orParameters: unknown[] = [];
    for (let index = 0; index < sortExpressions.length; index++) {
      const equalityParts: string[] = [];
      const equalityParameters: unknown[] = [];
      for (let index_ = 0; index_ < index; index_++) {
        const priorExpr = sortExpressions[index_];
        if (!priorExpr) {
          continue;
        }
        const equality = nullSafeEquals(priorExpr.sql, cursorValues[index_]);
        equalityParts.push(equality.sql);
        equalityParameters.push(...priorExpr.params, ...equality.params);
      }
      const currentExpr = sortExpressions[index];
      if (!currentExpr) {
        continue;
      }
      const comparison = nullSafeAfter(currentExpr.sql, currentExpr.direction, cursorValues[index]);
      const comparisonPart = comparison.sql;
      const comparisonParameters = [...currentExpr.params, ...comparison.params];

      const parts = [...equalityParts, comparisonPart];
      orClauses.push(`(${parts.join(' AND ')})`);
      orParameters.push(...equalityParameters, ...comparisonParameters);
    }

    whereClauses.push(`(${orClauses.join(' OR ')})`);
    whereParameters.push(...orParameters);
  }

  const orderByClause = sortExpressions.map((expr) => `${expr.sql} ${expr.direction}`).join(', ');
  const orderByParameters = sortExpressions.flatMap((expr) => expr.params);

  const tableName = adapter.quoteTableName('container');
  // Fetch one extra row (limit + 1) to determine `hasMore` without a separate COUNT query.
  const fetchLimit = options.limit + 1;
  const sql = `SELECT id, contents FROM ${tableName} WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderByClause} LIMIT ${fetchLimit}`;
  const parameters = [...whereParameters, ...orderByParameters];

  const rows = await adapter.runQuery(sql, parameters);

  const hasMore = rows.length > options.limit;
  const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
  const pages = pageRows.map((row) => adapter.transformRow(row));

  const lastPage = pages.at(-1);
  const nextCursor =
    hasMore && lastPage
      ? {
          // Exclude the trailing `id` tiebreak — its value is `containerId` below.
          values: sortExpressions.slice(0, -1).map((expr) => expr.valueOf(lastPage)),
          containerId: lastPage.id,
        }
      : null;

  return { pages, nextCursor, hasMore };
}
