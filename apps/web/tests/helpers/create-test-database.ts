import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { createDatabaseContext } from '@thoth/database';

/**
 * Test-only helper for unit tests that exercise web-owned modules (`@/lib/database` et al.)
 * against a real, isolated SQLite file. Since THOTH-058, the web `@/lib/database` adapter always
 * opens the database with `skipSync: true` (schema sync/migrations are the exclusive
 * responsibility of `packages/database/src/cli/migrate.ts`), so a fresh temp SQLite file no
 * longer gets its schema created implicitly on first use.
 *
 * This helper pre-creates the schema directly via `@thoth/database`'s `createDatabaseContext`
 * (with `skipSync: false`, mirroring what the migration CLI does) against a fresh temp file,
 * then closes that context — leaving a schema-ready SQLite file on disk that the test's own
 * `@/lib/database` import (opened separately, with `skipSync: true`) can safely read/write.
 */
export async function createTestDatabaseFile(
  prefix: string
): Promise<{ temporaryDirectory: string; databaseUrl: string }> {
  const temporaryDirectory = await mkdtemp(nodePath.join(tmpdir(), prefix));
  const databaseFile = nodePath.join(temporaryDirectory, 'test.db');
  const databaseUrl = `sqlite://${databaseFile}`;

  const context = createDatabaseContext({ connectionString: databaseUrl, skipSync: false });
  await context.getDatabase();
  await context.close();

  return { temporaryDirectory, databaseUrl };
}
