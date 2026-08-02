import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import { getDatabase } from './index';
import { getEnvironment } from '../environment';
import { BadRequestError } from '../errors/bad-request-error';
import type { Column } from '@/types/schemas/entities/container';
import {
  OPERATORS_BY_COLUMN_TYPE,
  VALUELESS_OPERATORS,
  type FilterRule,
  type SortRule,
} from '@/types/schemas/entities/data-view-query';
import type { PageContainer } from '@/types/database';

// `OPERATORS_BY_COLUMN_TYPE`/`VALUELESS_OPERATORS` now live in the schema module (see there for
// rationale) so client components can import them without pulling in this file's server-only DB
// driver imports. Re-exported here for backward compatibility with existing importers (e.g.
// `page-query-service.test.ts`).

export type PageQueryCursor = {
  values: (string | number | boolean | null)[];
  containerId: string;
};

export type ExecutePageQueryOptions = {
  parentId: string;
  columns: Column[];
  filters: FilterRule[];
  sorts: SortRule[];
  cursor?: PageQueryCursor;
  limit: number;
};

export type ExecutePageQueryResult = {
  pages: PageContainer[];
  nextCursor: PageQueryCursor | null;
  hasMore: boolean;
};

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
function dropStaleRules(
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

function jsonPath(columnId: string): string {
  return `$.values.${columnId}.value`;
}

type Engine = 'sqlite' | 'mysql';

async function resolveEngine(): Promise<Engine> {
  const environment = await getEnvironment();
  return environment.DB.startsWith('sqlite://') ? 'sqlite' : 'mysql';
}

/**
 * Returns the SQL fragment (with a single bound `?` parameter for the JSON path) used to
 * extract a column's raw value out of `contents`. On SQLite, `json_extract` already unquotes
 * scalar values. On MySQL/MariaDB, `JSON_EXTRACT` returns a `JSON` value that must be
 * `JSON_UNQUOTE`d to compare as a plain string/number against a bound parameter (see
 * `page-query-service.test.ts` for the case this guards).
 */
function extractExpression(engine: Engine): string {
  return engine === 'sqlite' ? 'json_extract(contents, ?)' : 'JSON_UNQUOTE(JSON_EXTRACT(contents, ?))';
}

/** Same as `extractExpression`, but without `JSON_UNQUOTE` — used for array/length checks where
 * we want the raw JSON value (arrays), not a stringified scalar. */
function extractRawExpression(engine: Engine): string {
  return engine === 'sqlite' ? 'json_extract(contents, ?)' : 'JSON_EXTRACT(contents, ?)';
}

type SqlFragment = { sql: string; params: unknown[] };

function buildFilterFragment(engine: Engine, column: Column, filter: FilterRule): SqlFragment {
  const path = jsonPath(filter.columnId);
  const isString = column.type === 'string';
  // SQLite's built-in `.sort()` uses `COLLATE NOCASE`; mirror that for string filters/sorts so
  // case-insensitive comparisons stay consistent with the rest of the codebase (THOTH-037 Edge
  // Cases). MySQL/MariaDB's default collation is already case-insensitive, no override needed.
  const collate = isString && engine === 'sqlite' ? ' COLLATE NOCASE' : '';

  switch (filter.operator) {
    case 'isEmpty': {
      if (column.type === 'multi-select') {
        const lengthFunction = engine === 'sqlite' ? 'json_array_length' : 'JSON_LENGTH';
        return {
          sql: `(${extractRawExpression(engine)} IS NULL OR ${lengthFunction}(${extractRawExpression(engine)}) = 0)`,
          params: [path, path],
        };
      }
      return {
        sql: `(${extractExpression(engine)} IS NULL OR ${extractExpression(engine)} = '')`,
        params: [path, path],
      };
    }
    case 'isNotEmpty': {
      if (column.type === 'multi-select') {
        const lengthFunction = engine === 'sqlite' ? 'json_array_length' : 'JSON_LENGTH';
        return {
          sql: `(${extractRawExpression(engine)} IS NOT NULL AND ${lengthFunction}(${extractRawExpression(engine)}) > 0)`,
          params: [path, path],
        };
      }
      return {
        sql: `(${extractExpression(engine)} IS NOT NULL AND ${extractExpression(engine)} != '')`,
        params: [path, path],
      };
    }
    case 'equals': {
      return { sql: `${extractExpression(engine)}${collate} = ?`, params: [path, filter.value] };
    }
    case 'notEquals': {
      return {
        sql: `(${extractExpression(engine)} IS NULL OR ${extractExpression(engine)}${collate} != ?)`,
        params: [path, path, filter.value],
      };
    }
    case 'contains': {
      return {
        sql: `${extractExpression(engine)}${collate} LIKE ?`,
        params: [path, `%${String(filter.value)}%`],
      };
    }
    case 'notContains': {
      return {
        sql: `(${extractExpression(engine)} IS NULL OR ${extractExpression(engine)}${collate} NOT LIKE ?)`,
        params: [path, path, `%${String(filter.value)}%`],
      };
    }
    case 'gt': {
      return { sql: `${extractExpression(engine)} > ?`, params: [path, filter.value] };
    }
    case 'gte': {
      return { sql: `${extractExpression(engine)} >= ?`, params: [path, filter.value] };
    }
    case 'lt': {
      return { sql: `${extractExpression(engine)} < ?`, params: [path, filter.value] };
    }
    case 'lte': {
      return { sql: `${extractExpression(engine)} <= ?`, params: [path, filter.value] };
    }
    case 'hasAnyOf': {
      const ids = Array.isArray(filter.value) ? filter.value : [];
      if (ids.length === 0) {
        return { sql: '0 = 1', params: [] };
      }
      if (engine === 'sqlite') {
        const placeholders = ids.map(() => '?').join(', ');
        return {
          sql: `EXISTS (SELECT 1 FROM json_each(${extractRawExpression(engine)}) WHERE json_each.value IN (${placeholders}))`,
          params: [path, ...ids],
        };
      }
      const clauses = ids.map(() => `JSON_CONTAINS(${extractRawExpression(engine)}, JSON_QUOTE(?))`).join(' OR ');
      return { sql: `(${clauses})`, params: ids.flatMap((id) => [path, id]) };
    }
    case 'hasAllOf': {
      const ids = Array.isArray(filter.value) ? filter.value : [];
      if (ids.length === 0) {
        return { sql: '1 = 1', params: [] };
      }
      if (engine === 'sqlite') {
        const placeholders = ids.map(() => '?').join(', ');
        return {
          sql: `(SELECT COUNT(DISTINCT json_each.value) FROM json_each(${extractRawExpression(engine)}) WHERE json_each.value IN (${placeholders})) = ?`,
          params: [path, ...ids, ids.length],
        };
      }
      const clauses = ids.map(() => `JSON_CONTAINS(${extractRawExpression(engine)}, JSON_QUOTE(?))`).join(' AND ');
      return { sql: `(${clauses})`, params: ids.flatMap((id) => [path, id]) };
    }
    default: {
      throw new BadRequestError(`Unsupported filter operator: ${filter.operator as string}`);
    }
  }
}

function buildSortExpression(engine: Engine, column: Column): { sql: string; params: unknown[] } {
  const path = jsonPath(column.id);
  const collate = column.type === 'string' && engine === 'sqlite' ? ' COLLATE NOCASE' : '';
  return { sql: `${extractExpression(engine)}${collate}`, params: [path] };
}

type Row = { id: string; contents: string | Record<string, unknown> };

function transformRow(engine: Engine, row: Row): PageContainer {
  // Mirrors SuperSave's own `Repository.transformQueryResultRow()`: MySQL/MariaDB's `mysql2`
  // driver may already have parsed a JSON-typed column into an object, whereas SQLite's
  // `contents` column is really `TEXT` and always comes back as a string (spike finding 5).
  const parsedContents =
    engine === 'mysql' && typeof row.contents !== 'string' ? row.contents : JSON.parse(row.contents as string);

  return { ...parsedContents, id: row.id } as PageContainer;
}

/**
 * Executes a raw-SQL, cursor-paginated query for pages under `parentId`, applying `filters`
 * (AND-only) and `sorts` against the dynamic per-column values stored in `Container.values`
 * (see THOTH-037). Falls back to `createdAt asc, id asc` when no sort rules are given, and
 * always appends `id asc` as a final tiebreak for stable keyset pagination.
 *
 * Filter/sort rules referencing a `columnId` no longer in `columns` (deleted column, or a type
 * change that invalidated the operator) are silently dropped rather than causing an error.
 */
export async function executePageQuery(options: ExecutePageQueryOptions): Promise<ExecutePageQueryResult> {
  const engine = await resolveEngine();
  const database = await getDatabase();

  const { filters, sorts } = dropStaleRules(options.columns, options.filters, options.sorts);
  const columnsById = new Map(options.columns.map((column) => [column.id, column]));

  const whereClauses: string[] = ["type = 'page'", 'deletedAt IS NULL', 'parentId = ?'];
  const whereParameters: unknown[] = [options.parentId];

  for (const filter of filters) {
    const column = columnsById.get(filter.columnId);
    if (!column) {
      continue;
    }
    const fragment = buildFilterFragment(engine, column, filter);
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
    const expression = buildSortExpression(engine, column);
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
  if (options.cursor) {
    // The trailing `id asc` tiebreak's cursor value is always `containerId`; every other key's
    // value comes from `options.cursor.values` in the same order the sort expressions were built.
    const cursorValues: unknown[] = [...options.cursor.values, options.cursor.containerId];

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
        equalityParts.push(`${priorExpr.sql} = ?`);
        equalityParameters.push(...priorExpr.params, cursorValues[index_]);
      }
      const currentExpr = sortExpressions[index];
      if (!currentExpr) {
        continue;
      }
      const op = currentExpr.direction === 'asc' ? '>' : '<';
      const comparisonPart = `${currentExpr.sql} ${op} ?`;
      const comparisonParameters = [...currentExpr.params, cursorValues[index]];

      const parts = [...equalityParts, comparisonPart];
      orClauses.push(`(${parts.join(' AND ')})`);
      orParameters.push(...equalityParameters, ...comparisonParameters);
    }

    whereClauses.push(`(${orClauses.join(' OR ')})`);
    whereParameters.push(...orParameters);
  }

  const orderByClause = sortExpressions.map((expr) => `${expr.sql} ${expr.direction}`).join(', ');
  const orderByParameters = sortExpressions.flatMap((expr) => expr.params);

  const tableName = engine === 'mysql' ? '`container`' : '"container"';
  // Fetch one extra row (limit + 1) to determine `hasMore` without a separate COUNT query.
  const fetchLimit = options.limit + 1;
  const sql = `SELECT id, contents FROM ${tableName} WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderByClause} LIMIT ${fetchLimit}`;
  const parameters = [...whereParameters, ...orderByParameters];

  let rows: Row[];
  if (engine === 'sqlite') {
    const connection = database.getConnection<Database>();
    rows = connection.prepare(sql).all(...parameters) as Row[];
  } else {
    const pool = database.getConnection<Pool>();
    const [resultRows] = await pool.query(sql, parameters);
    rows = resultRows as Row[];
  }

  const hasMore = rows.length > options.limit;
  const pageRows = hasMore ? rows.slice(0, options.limit) : rows;
  const pages = pageRows.map((row) => transformRow(engine, row));

  const lastPage = pages.at(-1);
  const nextCursor: PageQueryCursor | null =
    hasMore && lastPage
      ? {
          // Exclude the trailing `id` tiebreak — its value is `containerId` below.
          values: sortExpressions.slice(0, -1).map((expr) => expr.valueOf(lastPage)),
          containerId: lastPage.id,
        }
      : null;

  return { pages, nextCursor, hasMore };
}

export { OPERATORS_BY_COLUMN_TYPE, VALUELESS_OPERATORS } from '@/types/schemas/entities/data-view-query';
