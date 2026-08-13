import { createDatabaseContext, setDatabaseContext, resetDatabaseContext } from '@thoth/database';
import {
  getDatabase as getPackageDatabase,
  getContainerRepository as getPackageContainerRepository,
  getContainerAccessRepository as getPackageContainerAccessRepository,
  getWorkspaceRepository as getPackageWorkspaceRepository,
  getDataViewRepository as getPackageDataViewRepository,
  getWorkspaceMemberRepository as getPackageWorkspaceMemberRepository,
  getWorkspaceSlugRedirectRepository as getPackageWorkspaceSlugRedirectRepository,
  getAppRepository as getPackageAppRepository,
  getApiKeyRepository as getPackageApiKeyRepository,
  getAppScopedContainerRepository as getPackageAppScopedContainerRepository,
  getMemberScopedContainerRepository as getPackageMemberScopedContainerRepository,
  getWebhookRepository as getPackageWebhookRepository,
  getWebhookDeliveryRepository as getPackageWebhookDeliveryRepository,
  getUploadedFileRepository as getPackageUploadedFileRepository,
  getFileUsageRepository as getPackageFileUsageRepository,
  getPageRevisionRepository as getPackagePageRevisionRepository,
  getSettingRepository as getPackageSettingRepository,
  getPlatformUserRepository as getPackagePlatformUserRepository,
  getNotificationRepository as getPackageNotificationRepository,
  getNotificationRuleRepository as getPackageNotificationRuleRepository,
} from '@thoth/database';
import { getEnvironment } from '../environment';

let initializationPromise: Promise<void> | undefined;

/**
 * Registers the web-owned `@thoth/database` context exactly once, reading the validated web
 * environment and always passing `skipSync: true` (THOTH-058): the long-running web process
 * must never sync schema or run migrations itself — that is exclusively the job of
 * `packages/database/src/cli/migrate.ts`, run before this process starts. On failure, the
 * cached promise is cleared so a later call can retry.
 */
async function ensureDatabaseContext(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const environment = await getEnvironment();
      const context = createDatabaseContext({ connectionString: environment.DB, skipSync: true });
      setDatabaseContext(context);
    })().catch((error: unknown) => {
      initializationPromise = undefined;
      resetDatabaseContext();
      throw error;
    });
  }

  return initializationPromise;
}

export async function getDatabase() {
  await ensureDatabaseContext();
  return getPackageDatabase();
}

export async function getContainerRepository() {
  await ensureDatabaseContext();
  return getPackageContainerRepository();
}

export async function getContainerAccessRepository() {
  await ensureDatabaseContext();
  return getPackageContainerAccessRepository();
}

export async function getWorkspaceRepository() {
  await ensureDatabaseContext();
  return getPackageWorkspaceRepository();
}

export async function getDataViewRepository() {
  await ensureDatabaseContext();
  return getPackageDataViewRepository();
}

export async function getWorkspaceMemberRepository() {
  await ensureDatabaseContext();
  return getPackageWorkspaceMemberRepository();
}

export async function getWorkspaceSlugRedirectRepository() {
  await ensureDatabaseContext();
  return getPackageWorkspaceSlugRedirectRepository();
}

export async function getAppRepository() {
  await ensureDatabaseContext();
  return getPackageAppRepository();
}

export async function getApiKeyRepository() {
  await ensureDatabaseContext();
  return getPackageApiKeyRepository();
}

export async function getAppScopedContainerRepository() {
  await ensureDatabaseContext();
  return getPackageAppScopedContainerRepository();
}

export async function getMemberScopedContainerRepository() {
  await ensureDatabaseContext();
  return getPackageMemberScopedContainerRepository();
}

export async function getWebhookRepository() {
  await ensureDatabaseContext();
  return getPackageWebhookRepository();
}

export async function getWebhookDeliveryRepository() {
  await ensureDatabaseContext();
  return getPackageWebhookDeliveryRepository();
}

export async function getUploadedFileRepository() {
  await ensureDatabaseContext();
  return getPackageUploadedFileRepository();
}

export async function getFileUsageRepository() {
  await ensureDatabaseContext();
  return getPackageFileUsageRepository();
}

export async function getPageRevisionRepository() {
  await ensureDatabaseContext();
  return getPackagePageRevisionRepository();
}

export async function getSettingRepository() {
  await ensureDatabaseContext();
  return getPackageSettingRepository();
}

export async function getPlatformUserRepository() {
  await ensureDatabaseContext();
  return getPackagePlatformUserRepository();
}

export async function getNotificationRepository() {
  await ensureDatabaseContext();
  return getPackageNotificationRepository();
}

export async function getNotificationRuleRepository() {
  await ensureDatabaseContext();
  return getPackageNotificationRuleRepository();
}

/**
 * Eagerly registers the database context once, at process boot. Package-level DB-pure service
 * shims (e.g. `@/lib/database/app-service`) call `@thoth/database`'s repository accessors
 * directly, bypassing the `ensureDatabaseContext()` wrapping above — so the context must
 * already be registered before any of those are used. Called from `apps/web/src/instrumentation.ts`,
 * which Next.js runs once before serving any request.
 */
export async function initializeDatabase(): Promise<void> {
  await ensureDatabaseContext();
}
