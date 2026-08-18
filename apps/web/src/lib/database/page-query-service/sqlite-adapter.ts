import type { Database } from 'better-sqlite3';
import { getDatabase } from '../index';
import type { PageQueryEngineAdapter } from './adapter';
import type { Row, SqlFragment } from './types';
import type { PageContainer } from '@thoth/database/types';

/**
 * SQLite implementation of `PageQueryEngineAdapter` (see `adapter.ts` for the rationale). Mirrors
 * SQLite-specific quirks: `json_extract` already unquotes scalars, `json_each` powers array
 * membership checks, and `better-sqlite3` refuses to bind raw JS booleans (see
 * https://github.com/WiseLibs/better-sqlite3/issues/258 — SQLite itself has no boolean storage
 * class and represents JSON `true`/`false` as the integers 1/0 once extracted via
 * `json_extract`, so normalizing here matches the stored representation).
 */
export function createSqliteAdapter(): PageQueryEngineAdapter {
  return {
    engine: 'sqlite',

    quoteTableName(name: string): string {
      return `"${name}"`;
    },

    extractExpression(): string {
      return 'json_extract(contents, ?)';
    },

    extractRawExpression(): string {
      return 'json_extract(contents, ?)';
    },

    arrayLengthExpression(rawExpression: string): string {
      return `json_array_length(${rawExpression})`;
    },

    stringCollation(): string {
      // SQLite's built-in `.sort()` uses `COLLATE NOCASE`; mirror that for string filters/sorts
      // so case-insensitive comparisons stay consistent with the rest of the codebase (THOTH-037
      // Edge Cases).
      return ' COLLATE NOCASE';
    },

    normalizeFilterValue(value: unknown): unknown {
      return typeof value === 'boolean' ? (value ? 1 : 0) : value;
    },

    buildBooleanEquals(path: string, value: boolean): SqlFragment {
      // `json_extract` returns `NULL` when the column was never set (no key in `values`) —
      // `COALESCE(..., 0)` treats that the same as an explicit `false`, matching the checkbox's
      // unchecked-by-default UI representation instead of excluding those rows entirely.
      return { sql: 'COALESCE(json_extract(contents, ?), 0) = ?', params: [path, value ? 1 : 0] };
    },

    buildHasAnyOf(path: string, ids: unknown[]): SqlFragment {
      if (ids.length === 0) {
        return { sql: '0 = 1', params: [] };
      }
      const placeholders = ids.map(() => '?').join(', ');
      return {
        sql: `EXISTS (SELECT 1 FROM json_each(json_extract(contents, ?)) WHERE json_each.value IN (${placeholders}))`,
        params: [path, ...ids],
      };
    },

    buildHasAllOf(path: string, ids: unknown[]): SqlFragment {
      if (ids.length === 0) {
        return { sql: '1 = 1', params: [] };
      }
      const placeholders = ids.map(() => '?').join(', ');
      return {
        sql: `(SELECT COUNT(DISTINCT json_each.value) FROM json_each(json_extract(contents, ?)) WHERE json_each.value IN (${placeholders})) = ?`,
        params: [path, ...ids, ids.length],
      };
    },

    nullSafeEqualsOperator(): string {
      return 'IS';
    },

    transformRow(row: Row): PageContainer {
      // SQLite's `contents` column is really `TEXT` and always comes back as a string (spike
      // finding 5).
      return { ...JSON.parse(row.contents as string), id: row.id } as PageContainer;
    },

    async runQuery(sql: string, parameters: unknown[]): Promise<Row[]> {
      const database = await getDatabase();
      const connection = database.getConnection<Database>();
      return connection.prepare(sql).all(...parameters) as Row[];
    },
  };
}
