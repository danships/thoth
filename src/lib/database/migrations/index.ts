import type { Migration, SuperSave } from 'supersave';
import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import { BETTER_AUTH_SQLITE_SQL, BETTER_AUTH_MYSQL_SQL } from './better-auth';

export const migrations: Migration[] = [
  {
    name: 'better-auth-tables',
    engine: 'sqlite',
    run: async (superSave: SuperSave) => {
      const database = superSave.getConnection<Database>();
      database.exec(BETTER_AUTH_SQLITE_SQL);
    },
  },
  {
    name: 'better-auth-tables',
    engine: 'mysql',
    run: async (superSave: SuperSave) => {
      const pool = superSave.getConnection<Pool>();
      // MySQL requires executing statements one at a time
      const statements = BETTER_AUTH_MYSQL_SQL.split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await pool.query(statement);
      }
    },
  },
];
