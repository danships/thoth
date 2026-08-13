import type { Migration, SuperSave } from 'supersave';
import type { Database } from 'better-sqlite3';
import type { Pool } from 'mysql2/promise';
import { BETTER_AUTH_SQLITE_SQL, BETTER_AUTH_MYSQL_SQL } from './better-auth.js';
import { backfillSoftDeleteFields } from './soft-delete-backfill.js';
import { backfillWorkspaces } from './workspace-backfill.js';
import { backfillWorkspaceStorageQuota } from './workspace-storage-quota-backfill.js';
import { backfillMemberAccess } from './member-access-backfill.js';
import { backfillContainerSortOrder } from './container-sort-order-backfill.js';
import { backfillPlatformUsers } from './platform-user-backfill.js';
import { backfillWorkspaceQuotaSettings } from './workspace-quota-settings-backfill.js';
import { backfillUploadedFileBillingUser } from './uploaded-file-billing-user-backfill.js';
import { backfillWebhookDeliveryStatus } from './webhook-delivery-status-backfill.js';

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
  {
    // Engine-agnostic backfill of `sortOrder` on pre-existing, parented `Container` rows for
    // THOTH-036 ("Manual reordering of pages in a view/datasource"). Adding `sortOrder` to
    // `filterSortFields` (see `entities/container.ts`) lets SuperSave manage the column itself;
    // this migration only seeds values, matching the existing `lastUpdated desc` child order so
    // the post-migration manual order is a no-op reshuffle for existing users.
    name: 'container-sort-order-backfill',
    run: async (superSave: SuperSave) => {
      await backfillContainerSortOrder(superSave);
    },
  },
  {
    // THOTH-045: projects every existing Better Auth user into a `platform-user` row and
    // designates the earliest-registered user the sole `platform_admin`. Must run after
    // `better-auth-tables` (whose `user` table it reads).
    name: 'platform-user-backfill',
    run: async (superSave: SuperSave) => {
      await backfillPlatformUsers(superSave);
    },
  },
  {
    // THOTH-045: migrates non-default `workspace.storageQuotaBytes` values into workspace-scoped
    // `storage.quota_bytes` settings, the new source of truth for quotas.
    name: 'workspace-quota-settings-backfill',
    run: async (superSave: SuperSave) => {
      await backfillWorkspaceQuotaSettings(superSave);
    },
  },
  {
    // THOTH-045: populates `billingUserId` on existing `uploaded-file` rows so per-user storage
    // quotas can be enforced against pre-existing uploads.
    name: 'uploaded-file-billing-user-backfill',
    run: async (superSave: SuperSave) => {
      await backfillUploadedFileBillingUser(superSave);
    },
  },
  {
    // THOTH-061: normalizes pre-existing `webhook-delivery` rows onto the expanded
    // pending/retrying/success/failed/cancelled lifecycle (sourceJobId/nextAttemptAt/completedAt).
    name: 'webhook-delivery-status-backfill',
    run: async (superSave: SuperSave) => {
      await backfillWebhookDeliveryStatus(superSave);
    },
  },
];

// Re-exported (in addition to being wired into the `migrations` array above) so the e2e seed
// script can replicate the same sort-order backfill directly against a fresh, in-memory
// `SuperSave` instance without running the full migration set.
export { backfillContainerSortOrder } from './container-sort-order-backfill.js';
