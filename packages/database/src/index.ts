// Public entry point for `@thoth/database` (THOTH-058). Curated so consumers (the web adapter,
// a future job service, the migration CLI) reach package internals only through this file and
// its subpath exports (`./types`, `./schemas`, `./errors`) — never `src/**` directly.

// Context/factory + repository access
export { createDatabaseContext, setDatabaseContext, resetDatabaseContext, getDatabaseContext } from './context';
export type { DatabaseContext, CreateDatabaseContextOptions } from './context';
export {
  getDatabase,
  getContainerRepository,
  getContainerAccessRepository,
  getWorkspaceRepository,
  getDataViewRepository,
  getWorkspaceMemberRepository,
  getWorkspaceSlugRedirectRepository,
  getAppRepository,
  getApiKeyRepository,
  getAppScopedContainerRepository,
  getMemberScopedContainerRepository,
  getWebhookRepository,
  getWebhookDeliveryRepository,
  getUploadedFileRepository,
  getFileUsageRepository,
  getPageRevisionRepository,
  getSettingRepository,
  getPlatformUserRepository,
} from './repositories';

// Migrations (exposed for the CLI and tests)
export { migrations, backfillContainerSortOrder } from './migrations';

// Query helpers (THOTH-042: `addWorkspaceIdToQuery` gates CONTENT; `addUserIdToQuery` is
// reserved for per-user state such as `ContainerAccess`)
export { addUserIdToQuery, addWorkspaceIdToQuery } from './helpers';

// DB-pure services
export {
  toAppOwnerId,
  isAppOwnerId,
  parseAppOwnerId,
  generateApiKey,
  verifyApiKey,
  resolveContainerDescendants,
  resolvePageEmbeddedContainerIds,
  syncAppWorkspaceMembership,
} from './app-service';
export {
  assertContainerIdsBelongToWorkspace,
  replaceScopedContainers,
  clearScopedContainers,
  deleteScopedContainerReferences,
  addScopedContainer,
  removeScopedContainer,
} from './app-scope-service';
export { registerContainerAccessForNewPage } from './container-access-service';
export { reserveWorkspaceSlug, isWorkspaceSlugAvailable, generateUniqueWorkspaceSlug } from './workspace-slug';
export { createWorkspaceForUser } from './seed-workspace';
export {
  sortByManualOrder,
  getMaxSiblingSortOrder,
  getMinSiblingSortOrder,
  computeReorderKey,
  rebalanceSiblingGroup,
} from './sort-order-service';
export {
  MAX_DELIVERIES_PER_WEBHOOK,
  generateWebhookSecret,
  maskWebhookSecret,
  signPayload,
  recordAndPrune,
  deleteWebhook,
  deleteWebhooksForApp,
  listWebhooksForApp,
} from './webhook-service';
export type { RecordDeliveryInput } from './webhook-service';
export { RESERVED_WORKSPACE_SLUGS, slugify, isReservedWorkspaceSlug } from './utils/slug';

// Entity definitions (for consumers that need entity/table names directly)
export * as entities from './entities';

// Types (also available via the `@thoth/database/types` subpath)
export type {
  Container,
  ContainerAccess,
  DataView,
  Workspace,
  WorkspaceMember,
  WorkspaceSlugRedirect,
  App,
  ApiKey,
  AppScopedContainer,
  MemberScopedContainer,
  Webhook,
  WebhookDelivery,
  UploadedFile,
  FileUsage,
  PageRevision,
  Setting,
  PlatformUser,
} from './types';
