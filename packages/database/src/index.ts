// Public entry point for `@thoth/database` (THOTH-058). Curated so consumers (the web adapter,
// a future job service, the migration CLI) reach package internals only through this file and
// its subpath exports (`./types`, `./schemas`, `./errors`) — never `src/**` directly.

// Context/factory + repository access
export { createDatabaseContext, setDatabaseContext, resetDatabaseContext, getDatabaseContext } from './context.js';
export type { DatabaseContext, CreateDatabaseContextOptions } from './context.js';
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
} from './repositories.js';

// Migrations (exposed for the CLI and tests)
export { migrations, backfillContainerSortOrder } from './migrations/index.js';

// Query helpers (THOTH-042: `addWorkspaceIdToQuery` gates CONTENT; `addUserIdToQuery` is
// reserved for per-user state such as `ContainerAccess`)
export { addUserIdToQuery, addWorkspaceIdToQuery } from './helpers.js';

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
} from './app-service.js';
export {
  assertContainerIdsBelongToWorkspace,
  replaceScopedContainers,
  clearScopedContainers,
  deleteScopedContainerReferences,
  addScopedContainer,
  removeScopedContainer,
  InvalidContainerIdsError,
} from './app-scope-service.js';
export { registerContainerAccessForNewPage } from './container-access-service.js';
export {
  reserveWorkspaceSlug,
  isWorkspaceSlugAvailable,
  generateUniqueWorkspaceSlug,
  WorkspaceSlugConflictError,
} from './workspace-slug.js';
export { createWorkspaceForUser } from './seed-workspace.js';
export {
  sortByManualOrder,
  getMaxSiblingSortOrder,
  getMinSiblingSortOrder,
  computeReorderKey,
  rebalanceSiblingGroup,
} from './sort-order-service.js';
export {
  MAX_DELIVERIES_PER_WEBHOOK,
  generateWebhookSecret,
  maskWebhookSecret,
  signPayload,
  createPendingDelivery,
  findDeliveryBySourceJobAndWebhook,
  recordDeliveryAttempt,
  scheduleDeliveryRetry,
  completeDelivery,
  resetDeliveryForResend,
  pruneTerminalDeliveries,
  deleteWebhook,
  deleteWebhooksForApp,
  listWebhooksForApp,
} from './webhook-service.js';
export type { CreatePendingDeliveryInput, DeliveryAttemptOutcome } from './webhook-service.js';
export {
  appToAccessGrant,
  memberToAccessGrant,
  grantAllowsContainer,
  filterContainersByGrant,
} from './access-grant-service.js';
export type { AccessGrant } from './access-grant-service.js';
export { RESERVED_WORKSPACE_SLUGS, slugify, isReservedWorkspaceSlug } from './utils/slug.js';

// Re-exported (in addition to `@thoth/database/schemas`) so packages using `moduleResolution:
// Node10` (which cannot resolve the `exports` map's `./schemas` subpath) — e.g.
// `@thoth/job-protocol`'s webhook job schemas — can still import it from the package root.
export { pageValueSchema } from './schemas/entities/container.js';
export type { PageValue } from './schemas/entities/container.js';

// Entity definitions (for consumers that need entity/table names directly)
export * as entities from './entities/index.js';

// Types (also available via the `@thoth/database/types` subpath)
export type {
  Container,
  PageContainer,
  DataSourceContainer,
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
} from './types.js';
// Column/webhook-payload shapes also needed via the Node10-resolvable root entry (see the
// `pageValueSchema` comment above) — `apps/jobs`' dispatch/deliver handlers import these.
export type { Column } from './schemas/entities/container.js';
export type {
  WebhookDeliveryEvent,
  WebhookDeliveryStatus,
  WebhookPayload,
  WebhookRawValue,
} from './schemas/entities/webhook-delivery.js';
export { TERMINAL_WEBHOOK_DELIVERY_STATUSES } from './schemas/entities/webhook-delivery.js';
