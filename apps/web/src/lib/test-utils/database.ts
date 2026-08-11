import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import nodePath from 'node:path';
import { createDatabaseContext } from '@thoth/database';

/**
 * Spins up an isolated, migrated SuperSave SQLite database backed by a repo-local temp directory
 * (deliberately NOT the OS `tmpdir`) for DB-dependent unit tests (THOTH-045). Returns the freshly
 * imported `@/lib/database` module plus a `cleanup` that removes the temp directory.
 *
 * Each test file must call this in its own `beforeAll` so it gets a private database — the module
 * cache is per-file under Vitest's isolated worker model.
 *
 * Since THOTH-058, `@/lib/database` always opens the database with `skipSync: true` (schema
 * sync/migrations are the exclusive responsibility of `packages/database/src/cli/migrate.ts`), so
 * the schema is created directly here, via `@thoth/database`'s `createDatabaseContext` (with
 * `skipSync: false`, mirroring what the migration CLI does), before `@/lib/database` opens the
 * same file.
 */
export async function setupTestDatabase(prefix: string): Promise<{
  database: typeof import('@/lib/database');
  cleanup: () => Promise<void>;
}> {
  const baseDirectory = nodePath.resolve(import.meta.dirname, '../../../.vitest-tmp');
  await mkdir(baseDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(nodePath.join(baseDirectory, `${prefix}-`));
  const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
  const databaseUrl = `sqlite://${databaseFile}`;

  const mutableEnvironment = process.env as Record<string, string | undefined>;
  mutableEnvironment['NODE_ENV'] = 'test';
  mutableEnvironment['DB'] = databaseUrl;
  mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
  mutableEnvironment['LOG_LEVEL'] = 'error';

  const schemaContext = createDatabaseContext({ connectionString: databaseUrl, skipSync: false });
  await schemaContext.getDatabase();
  await schemaContext.close();

  const database = await import('@/lib/database');
  await database.getDatabase();

  return {
    database,
    cleanup: async () => {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}
