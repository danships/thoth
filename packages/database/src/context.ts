import { SuperSave } from 'supersave';
import type {
  Container,
  ContainerAccess,
  Workspace,
  DataView,
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
import * as entities from './entities/index.js';
import { migrations } from './migrations/index.js';

export type CreateDatabaseContextOptions = {
  /** SuperSave connection string, e.g. `sqlite://path/to/file.db` or a MySQL connection URL. */
  connectionString: string;
  /**
   * Whether SuperSave should skip automatic schema sync from entity definitions. The
   * long-running web/job runtime must always pass `true` here (see `apps/web/src/lib/database`)
   * — only `packages/database/src/cli/migrate.ts` is permitted to pass `false` and additionally
   * call `runMigrations()` (THOTH-058).
   */
  skipSync: boolean;
};

/**
 * Creates an isolated, explicit database context: registers every entity (in the same order as
 * the pre-THOTH-058 `apps/web/src/lib/database/index.ts`, so existing migration-tracking rows
 * are unaffected) against `connectionString`, without ever reading environment variables or
 * implicitly running migrations itself. Callers (the web adapter, the migration CLI, tests)
 * decide `skipSync` and whether/when to call `runMigrations()`.
 *
 * The in-flight initialization promise is cached per-context (not module-level), so concurrent
 * calls to any of this context's repository getters share one initialization; a failure clears
 * the cached promise so a later call can retry.
 */
export function createDatabaseContext(options: CreateDatabaseContextOptions) {
  let databasePromise: Promise<SuperSave> | undefined;

  async function initializeDatabase(): Promise<SuperSave> {
    const database = await SuperSave.create(options.connectionString, {
      migrations,
      skipSync: options.skipSync,
    });

    await database.addEntity(entities.Container);
    await database.addEntity(entities.ContainerAccess);
    await database.addEntity(entities.Workspace);
    await database.addEntity(entities.DataView);
    await database.addEntity(entities.WorkspaceMember);
    await database.addEntity(entities.WorkspaceSlugRedirect);
    await database.addEntity(entities.App);
    await database.addEntity(entities.ApiKey);
    await database.addEntity(entities.AppScopedContainer);
    await database.addEntity(entities.MemberScopedContainer);
    await database.addEntity(entities.Webhook);
    await database.addEntity(entities.WebhookDelivery);
    await database.addEntity(entities.UploadedFile);
    await database.addEntity(entities.FileUsage);
    await database.addEntity(entities.PageRevision);
    await database.addEntity(entities.Setting);
    await database.addEntity(entities.PlatformUser);

    return database;
  }

  async function getDatabase(): Promise<SuperSave> {
    if (!databasePromise) {
      databasePromise = initializeDatabase().catch((error: unknown) => {
        // Allow a subsequent call to retry initialization if it failed.
        databasePromise = undefined;
        throw error;
      });
    }

    return databasePromise;
  }

  async function runMigrations(): Promise<void> {
    const database = await getDatabase();
    await database.runMigrations();
  }

  async function close(): Promise<void> {
    if (!databasePromise) {
      return;
    }

    const database = await databasePromise.catch(() => undefined);
    databasePromise = undefined;
    await database?.close();
  }

  const context = {
    getDatabase,
    runMigrations,
    close,
    async getContainerRepository() {
      const database = await getDatabase();
      return database.getRepository<Container>(entities.CONTAINER_NAME);
    },
    async getContainerAccessRepository() {
      const database = await getDatabase();
      return database.getRepository<ContainerAccess>(entities.CONTAINER_ACCESS_NAME);
    },
    async getWorkspaceRepository() {
      const database = await getDatabase();
      return database.getRepository<Workspace>(entities.WORKSPACE_NAME);
    },
    async getDataViewRepository() {
      const database = await getDatabase();
      return database.getRepository<DataView>(entities.DATA_VIEW_NAME);
    },
    async getWorkspaceMemberRepository() {
      const database = await getDatabase();
      return database.getRepository<WorkspaceMember>(entities.WORKSPACE_MEMBER_NAME);
    },
    async getWorkspaceSlugRedirectRepository() {
      const database = await getDatabase();
      return database.getRepository<WorkspaceSlugRedirect>(entities.WORKSPACE_SLUG_REDIRECT_NAME);
    },
    async getAppRepository() {
      const database = await getDatabase();
      return database.getRepository<App>(entities.APP_NAME);
    },
    async getApiKeyRepository() {
      const database = await getDatabase();
      return database.getRepository<ApiKey>(entities.API_KEY_NAME);
    },
    async getAppScopedContainerRepository() {
      const database = await getDatabase();
      return database.getRepository<AppScopedContainer>(entities.APP_SCOPED_CONTAINER_NAME);
    },
    async getMemberScopedContainerRepository() {
      const database = await getDatabase();
      return database.getRepository<MemberScopedContainer>(entities.MEMBER_SCOPED_CONTAINER_NAME);
    },
    async getWebhookRepository() {
      const database = await getDatabase();
      return database.getRepository<Webhook>(entities.WEBHOOK_NAME);
    },
    async getWebhookDeliveryRepository() {
      const database = await getDatabase();
      return database.getRepository<WebhookDelivery>(entities.WEBHOOK_DELIVERY_NAME);
    },
    async getUploadedFileRepository() {
      const database = await getDatabase();
      return database.getRepository<UploadedFile>(entities.UPLOADED_FILE_NAME);
    },
    async getFileUsageRepository() {
      const database = await getDatabase();
      return database.getRepository<FileUsage>(entities.FILE_USAGE_NAME);
    },
    async getPageRevisionRepository() {
      const database = await getDatabase();
      return database.getRepository<PageRevision>(entities.PAGE_REVISION_NAME);
    },
    async getSettingRepository() {
      const database = await getDatabase();
      return database.getRepository<Setting>(entities.SETTING_NAME);
    },
    async getPlatformUserRepository() {
      const database = await getDatabase();
      return database.getRepository<PlatformUser>(entities.PLATFORM_USER_NAME);
    },
  };

  return context;
}

export type DatabaseContext = ReturnType<typeof createDatabaseContext>;

let defaultContext: DatabaseContext | undefined;

/**
 * Registers `context` as the module-level default used by the convenience `getXRepository()`
 * functions exported from `packages/database/src/index.ts` (and by every DB-pure service in
 * this package that calls them directly, e.g. `app-service.ts`, `seed-workspace.ts`). Each
 * consumer process (the web adapter, the migration CLI, a future job service, tests) creates
 * its own explicit context via `createDatabaseContext()` and registers it exactly once — this
 * package never reads environment variables or creates a context implicitly itself.
 */
export function setDatabaseContext(context: DatabaseContext): void {
  defaultContext = context;
}

/** Clears the registered default context. Intended for test teardown/isolation. */
export function resetDatabaseContext(): void {
  defaultContext = undefined;
}

export function getDatabaseContext(): DatabaseContext {
  if (!defaultContext) {
    throw new Error(
      'No database context registered. Call setDatabaseContext(createDatabaseContext(...)) before using any repository getter.'
    );
  }

  return defaultContext;
}
