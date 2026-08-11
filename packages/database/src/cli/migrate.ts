// Standalone migration CLI (THOTH-058) — the *only* production entry point permitted to enable
// schema sync and call `runMigrations()`. Run once, before the long-running web (and future job)
// process starts; that process always opens the database with `skipSync: true` and never calls
// `runMigrations()` itself (see `apps/web/src/lib/database/index.ts`).
//
// Usage: `DB=sqlite://./data/thoth.db node dist/cli/migrate.js` (or `tsx src/cli/migrate.ts` in
// development). Reads only the `DB` environment variable — no other application configuration
// is required to migrate the schema.
import { createDatabaseContext } from '../context';
import { migrations } from '../migrations';

async function main(): Promise<void> {
  const connectionString = process.env['DB'];

  if (!connectionString) {
    throw new Error('The DB environment variable must be set to a SuperSave connection string (e.g. sqlite://...).');
  }

  // Log migration names only — never the connection string, which may embed a hostname,
  // credentials, or a filesystem path revealing a tenant/customer name.
  console.log(`Running ${migrations.length} migration(s): ${migrations.map((migration) => migration.name).join(', ')}`);

  const context = createDatabaseContext({ connectionString, skipSync: false });

  try {
    // Registers every entity and (since `skipSync: false`) lets SuperSave sync the schema for
    // any entity that doesn't have one yet, before running the explicit, versioned migrations.
    await context.getDatabase();
    await context.runMigrations();
    console.log('Migrations completed successfully.');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
});
