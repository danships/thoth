import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import nodePath from 'node:path';

/**
 * Spins up an isolated, migrated SuperSave SQLite database backed by a repo-local temp directory
 * (deliberately NOT the OS `tmpdir`) for DB-dependent unit tests (THOTH-045). Returns the freshly
 * imported `@/lib/database` module plus a `cleanup` that removes the temp directory.
 *
 * Each test file must call this in its own `beforeAll` so it gets a private database — the module
 * cache is per-file under Vitest's isolated worker model.
 */
export async function setupTestDatabase(prefix: string): Promise<{
  database: typeof import('@/lib/database');
  cleanup: () => Promise<void>;
}> {
  const baseDirectory = nodePath.resolve(import.meta.dirname, '../../../.vitest-tmp');
  await mkdir(baseDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(nodePath.join(baseDirectory, `${prefix}-`));
  const databaseFile = nodePath.join(temporaryDirectory, 'test.db');

  const mutableEnvironment = process.env as Record<string, string | undefined>;
  mutableEnvironment['NODE_ENV'] = 'test';
  mutableEnvironment['DB'] = `sqlite://${databaseFile}`;
  mutableEnvironment['BETTER_AUTH_SECRET'] = 'test-secret-not-for-production-use';
  mutableEnvironment['LOG_LEVEL'] = 'error';

  const database = await import('@/lib/database');
  await database.getDatabase();

  return {
    database,
    cleanup: async () => {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}
