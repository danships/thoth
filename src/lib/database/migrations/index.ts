import type { Migration, SuperSave } from 'supersave';
import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import { BETTER_AUTH_SQLITE_SQL, BETTER_AUTH_MYSQL_SQL } from './better-auth';
import { backfillSoftDeleteFields } from './soft-delete-backfill';
import { backfillWorkspaces } from './workspace-backfill';
import { backfillWorkspaceStorageQuota } from './workspace-storage-quota-backfill';
import { backfillMemberAccess } from './member-access-backfill';

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
  {
    // Engine-agnostic (uses repository APIs, not raw SQL), so a single entry covers both
    // engines — SuperSave's migration runner tracks it by name and skips re-running it once
    // applied, exactly like the `better-auth-tables` migrations above.
    name: 'workspace-multi-tenancy-backfill',
    run: async (superSave: SuperSave) => {
      await backfillWorkspaces(superSave);
    },
  },
  {
    name: 'soft-delete-pages-views-backfill',
    run: async (superSave: SuperSave) => {
      await backfillSoftDeleteFields(superSave);
    },
  },
  {
    // Additive, engine-agnostic safety net (see `workspace-storage-quota-backfill.ts` for why
    // no separate migration is needed for the new `uploaded-file`/`file-usage` tables
    // themselves) backfilling `storageQuotaBytes` on pre-existing `Workspace` rows for
    // THOTH-040 ("Support file uploads").
    name: 'workspace-storage-quota-backfill',
    run: async (superSave: SuperSave) => {
      await backfillWorkspaceStorageQuota(superSave);
    },
  },
  {
    // Engine-agnostic backfill of `permission`/`scopeType` on pre-existing `workspace-member`
    // rows for THOTH-042 ("Prepare codebase for multi-user access to workspace"). Must run
    // after `workspace-multi-tenancy-backfill`, which creates the owner rows it backfills.
    name: 'member-access-backfill',
    run: async (superSave: SuperSave) => {
      await backfillMemberAccess(superSave);
    },
  },
];
