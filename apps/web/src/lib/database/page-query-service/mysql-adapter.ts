import type { Pool } from 'mysql2/promise';
import { getDatabase } from '../index';
import type { PageQueryEngineAdapter } from './adapter';
import type { Row, SqlFragment } from './types';
import type { PageContainer } from '@thoth/database/types';

/**
 * MySQL/MariaDB implementation of `PageQueryEngineAdapter` (see `adapter.ts` for the rationale).
 * `JSON_EXTRACT` returns a `JSON` value that must be `JSON_UNQUOTE`d to compare as a plain
 * string/number against a bound parameter, and array membership is checked via `JSON_CONTAINS`
 * (there's no `json_each`-equivalent table-valued function).
 */
export function createMysqlAdapter(): PageQueryEngineAdapter {
  return {
    engine: 'mysql',

    quoteTableName(name: string): string {
      return `\`${name}\``;
    },

    extractExpression(): string {
      return 'JSON_UNQUOTE(JSON_EXTRACT(contents, ?))';
    },

    extractRawExpression(): string {
      return 'JSON_EXTRACT(contents, ?)';
    },

    arrayLengthExpression(rawExpression: string): string {
      return `JSON_LENGTH(${rawExpression})`;
    },

    stringCollation(): string {
      // MySQL/MariaDB's default collation is already case-insensitive, no override needed.
      return '';
    },

    normalizeFilterValue(value: unknown): unknown {
      // MySQL's driver accepts JS booleans as bind params, unlike better-sqlite3.
      return value;
    },

    buildHasAnyOf(path: string, ids: unknown[]): SqlFragment {
      if (ids.length === 0) {
        return { sql: '0 = 1', params: [] };
      }
      const clauses = ids.map(() => 'JSON_CONTAINS(JSON_EXTRACT(contents, ?), JSON_QUOTE(?))').join(' OR ');
      return { sql: `(${clauses})`, params: ids.flatMap((id) => [path, id]) };
    },

    buildHasAllOf(path: string, ids: unknown[]): SqlFragment {
      if (ids.length === 0) {
        return { sql: '1 = 1', params: [] };
      }
      const clauses = ids.map(() => 'JSON_CONTAINS(JSON_EXTRACT(contents, ?), JSON_QUOTE(?))').join(' AND ');
      return { sql: `(${clauses})`, params: ids.flatMap((id) => [path, id]) };
    },

    nullSafeEqualsOperator(): string {
      return '<=>';
    },

    transformRow(row: Row): PageContainer {
      // `mysql2` may already have parsed a JSON-typed column into an object (mirrors SuperSave's
      // own `Repository.transformQueryResultRow()`).
      const parsedContents = typeof row.contents === 'string' ? JSON.parse(row.contents) : row.contents;
      return { ...parsedContents, id: row.id } as PageContainer;
    },

    async runQuery(sql: string, parameters: unknown[]): Promise<Row[]> {
      const database = await getDatabase();
      const pool = database.getConnection<Pool>();
      const [resultRows] = await pool.query(sql, parameters);
      return resultRows as Row[];
    },
  };
}
