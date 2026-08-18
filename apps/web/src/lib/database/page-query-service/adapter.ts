import { getEnvironment } from '../../environment';
import type { Engine, Row, SqlFragment } from './types';
import type { PageContainer } from '@thoth/database/types';

/**
 * Abstraction over the per-engine SQL dialect differences `executePageQuery` needs (THOTH-037
 * review feedback: replace the inline `engine === 'sqlite' ? ... : ...` conditionals scattered
 * through the query builder with a single interface, implemented once per engine in
 * `sqlite-adapter.ts`/`mysql-adapter.ts`). Adding a new storage engine means implementing this
 * interface and registering it in `getAdapter` below — the orchestration logic in `index.ts` and
 * the shared filter/sort SQL building in `query-builder.ts` stay untouched.
 */
export type PageQueryEngineAdapter = {
  readonly engine: Engine;

  /** Quotes a table name for inclusion in raw SQL (backtick-quoted for MySQL, double-quoted for
   * SQLite/standard SQL). */
  quoteTableName(name: string): string;

  /** SQL fragment (bound to a single `?` JSON-path parameter) that extracts a column's raw value
   * out of `contents`, unquoted to a plain scalar suitable for comparison against a bound
   * parameter. */
  extractExpression(): string;

  /** Same as `extractExpression`, but returns the raw JSON value (arrays) rather than an unquoted
   * scalar — used for array/length checks. */
  extractRawExpression(): string;

  /** Wraps a raw-JSON extraction expression with this engine's array-length function. */
  arrayLengthExpression(rawExpression: string): string;

  /** SQL collation suffix (e.g. `' COLLATE NOCASE'`) applied to string comparisons/sorts so
   * they're case-insensitive; empty string if the engine's default collation already is. */
  stringCollation(): string;

  /** Normalizes a filter value into a shape this engine's driver can bind as a query parameter
   * (e.g. SQLite can't bind raw JS booleans). */
  normalizeFilterValue(value: unknown): unknown;

  /** Builds a fragment that's true when the boolean column at `path` effectively equals `value`,
   * treating a missing/`NULL` value (checkbox never touched) the same as `false` — matching the
   * UI's unchecked-by-default representation instead of excluding those rows from every boolean
   * filter. Also the building block for `notEquals` on boolean columns (see `query-builder.ts`),
   * which simply wraps this in `NOT (...)`. Each engine encodes
   * booleans differently once extracted from JSON (SQLite: integers `1`/`0`; MySQL/MariaDB:
   * `JSON_UNQUOTE` always yields the strings `'true'`/`'false'`, never a numeric/boolean type —
   * comparing that string against a numeric/boolean bound parameter is unreliable since MySQL
   * coerces non-numeric strings to `0`), so the encoding of both the extraction default and
   * `value` must stay engine-specific here rather than shared in `query-builder.ts`. */
  buildBooleanEquals(path: string, value: boolean): SqlFragment;

  /** Builds the `hasAnyOf` filter fragment: true if the JSON array at `path` contains any of
   * `ids`. */
  buildHasAnyOf(path: string, ids: unknown[]): SqlFragment;

  /** Builds the `hasAllOf` filter fragment: true if the JSON array at `path` contains every one
   * of `ids`. */
  buildHasAllOf(path: string, ids: unknown[]): SqlFragment;

  /** SQL operator for a null-safe equality comparison (`IS` for SQLite, `<=>` for MySQL) — both
   * compare `NULL` to `NULL` as true, unlike plain `=`. */
  nullSafeEqualsOperator(): string;

  /** Parses a raw query result row's `contents` column into a `PageContainer`. */
  transformRow(row: Row): PageContainer;

  /** Executes `sql` (with positional `?` parameters) against this engine's connection. */
  runQuery(sql: string, parameters: unknown[]): Promise<Row[]>;
};

/** Determines which engine is configured via `DB` (see `src/lib/environment.ts`). */
export async function resolveEngine(): Promise<Engine> {
  const environment = await getEnvironment();
  return environment.DB.startsWith('sqlite://') ? 'sqlite' : 'mysql';
}

/** Resolves the `PageQueryEngineAdapter` for the currently configured engine. Adding support for
 * a new storage engine only requires adding a case here (and a new adapter module). */
export async function getAdapter(): Promise<PageQueryEngineAdapter> {
  const engine = await resolveEngine();
  switch (engine) {
    case 'sqlite': {
      const { createSqliteAdapter } = await import('./sqlite-adapter');
      return createSqliteAdapter();
    }
    case 'mysql': {
      const { createMysqlAdapter } = await import('./mysql-adapter');
      return createMysqlAdapter();
    }
  }
}
