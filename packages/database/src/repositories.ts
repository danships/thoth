import { getDatabaseContext } from './context.js';

/**
 * Convenience, module-level repository/database getters that delegate to whatever
 * `DatabaseContext` was last registered via `setDatabaseContext()`. Every DB-pure service in
 * this package (`app-service.ts`, `seed-workspace.ts`, `workspace-slug.ts`, etc.) is written
 * against these functions rather than threading a context object through every call, mirroring
 * the ergonomics of the pre-THOTH-058 `apps/web/src/lib/database/index.ts`. Consumers (the web
 * adapter, the migration CLI, tests) remain in full control of *which* context backs these calls
 * and *when* it's created — this module never creates one itself.
 */
export async function getDatabase() {
  return getDatabaseContext().getDatabase();
}

export async function getContainerRepository() {
  return getDatabaseContext().getContainerRepository();
}

export async function getContainerAccessRepository() {
  return getDatabaseContext().getContainerAccessRepository();
}

export async function getWorkspaceRepository() {
  return getDatabaseContext().getWorkspaceRepository();
}

export async function getDataViewRepository() {
  return getDatabaseContext().getDataViewRepository();
}

export async function getWorkspaceMemberRepository() {
  return getDatabaseContext().getWorkspaceMemberRepository();
}

export async function getWorkspaceSlugRedirectRepository() {
  return getDatabaseContext().getWorkspaceSlugRedirectRepository();
}

export async function getAppRepository() {
  return getDatabaseContext().getAppRepository();
}

export async function getApiKeyRepository() {
  return getDatabaseContext().getApiKeyRepository();
}

export async function getAppScopedContainerRepository() {
  return getDatabaseContext().getAppScopedContainerRepository();
}

export async function getMemberScopedContainerRepository() {
  return getDatabaseContext().getMemberScopedContainerRepository();
}

export async function getWebhookRepository() {
  return getDatabaseContext().getWebhookRepository();
}

export async function getWebhookDeliveryRepository() {
  return getDatabaseContext().getWebhookDeliveryRepository();
}

export async function getUploadedFileRepository() {
  return getDatabaseContext().getUploadedFileRepository();
}

export async function getFileUsageRepository() {
  return getDatabaseContext().getFileUsageRepository();
}

export async function getPageRevisionRepository() {
  return getDatabaseContext().getPageRevisionRepository();
}

export async function getSettingRepository() {
  return getDatabaseContext().getSettingRepository();
}

export async function getPlatformUserRepository() {
  return getDatabaseContext().getPlatformUserRepository();
}

export async function getNotificationRuleRepository() {
  return getDatabaseContext().getNotificationRuleRepository();
}

export async function getNotificationRepository() {
  return getDatabaseContext().getNotificationRepository();
}

export async function getPushSubscriptionRepository() {
  return getDatabaseContext().getPushSubscriptionRepository();
}

export async function getNotificationDeliveryRepository() {
  return getDatabaseContext().getNotificationDeliveryRepository();
}
