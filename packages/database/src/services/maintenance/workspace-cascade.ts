import {
  getAppRepository,
  getApiKeyRepository,
  getAppScopedContainerRepository,
  getContainerAccessRepository,
  getContainerRepository,
  getDataViewRepository,
  getFileUsageRepository,
  getMemberScopedContainerRepository,
  getPageRevisionRepository,
  getUploadedFileRepository,
  getWebhookDeliveryRepository,
  getWebhookRepository,
  getWorkspaceMemberRepository,
  getWorkspaceRepository,
  getWorkspaceSlugRedirectRepository,
} from '../../repositories.js';
import * as entities from '../../entities/index.js';

/**
 * Ordered inventory of every entity cascade-deleted as part of a workspace purge (THOTH-063).
 *
 * This list is the *complete* inventory of workspace-scoped entities as of this ticket —
 * `workspace-cascade.test.ts` asserts every entity in `../../entities/index.js` that is
 * workspace-scoped (either directly, via a `workspaceId` field, or indirectly, via a parent
 * `App`/`WorkspaceMember` this cascade already resolves) appears here. A new workspace-scoped
 * entity added later without updating this list — and the deletion order in
 * `cascadeDeleteWorkspace` below — fails that test, per the THOTH-063 spec's explicit
 * requirement ("Add a test that fails when a new workspace-scoped entity is registered without
 * cascade policy").
 *
 * Order matters: entities that reference an `App`/`WorkspaceMember` row (rather than the
 * workspace directly) are removed before their parent, and everything is removed before the
 * `Workspace` row itself.
 */
export const WORKSPACE_CASCADE_ENTITY_NAMES: readonly string[] = [
  entities.PAGE_REVISION_NAME,
  entities.MEMBER_SCOPED_CONTAINER_NAME,
  entities.APP_SCOPED_CONTAINER_NAME,
  entities.API_KEY_NAME,
  entities.WEBHOOK_DELIVERY_NAME,
  entities.WEBHOOK_NAME,
  entities.APP_NAME,
  entities.WORKSPACE_MEMBER_NAME,
  entities.CONTAINER_ACCESS_NAME,
  entities.FILE_USAGE_NAME,
  entities.UPLOADED_FILE_NAME,
  entities.DATA_VIEW_NAME,
  entities.CONTAINER_NAME,
  entities.WORKSPACE_SLUG_REDIRECT_NAME,
  entities.WORKSPACE_NAME,
];

export type WorkspaceCascadeCounts = {
  pageRevisions: number;
  memberScopedContainers: number;
  appScopedContainers: number;
  apiKeys: number;
  webhookDeliveries: number;
  webhooks: number;
  apps: number;
  workspaceMembers: number;
  containerAccess: number;
  fileUsages: number;
  uploadedFiles: number;
  dataViews: number;
  containers: number;
  workspaceSlugRedirects: number;
};

export type WorkspaceCascadeOptions = {
  /**
   * Optional storage-bytes deleter, called (best-effort, never blocking the rest of the
   * cascade) for every `uploaded-file` row's `storageKey` before its DB row is removed. When
   * omitted, storage bytes are left behind — acceptable for a workspace purge (unlike the
   * dedicated file-purge handler, which must retry a failed storage delete), since a whole
   * workspace's worth of orphaned bytes is a one-off, operationally visible cleanup task rather
   * than a per-file steady-state concern.
   */
  deleteStorageBytes?: (storageKey: string) => Promise<void>;
  onStorageDeleteError?: (fileId: string, storageKey: string, error: unknown) => void;
};

/**
 * Hard-deletes every row cascade-owned by `workspaceId`, in dependency order, then the workspace
 * row itself. Every step is idempotent — deleting an already-missing id (e.g. a crash partway
 * through a previous attempt) is a safe no-op, so a repeated call after a crash simply finishes
 * whatever rows remain rather than double-deleting or erroring.
 */
export async function cascadeDeleteWorkspace(
  workspaceId: string,
  options: WorkspaceCascadeOptions = {}
): Promise<WorkspaceCascadeCounts> {
  const appRepository = await getAppRepository();
  const apiKeyRepository = await getApiKeyRepository();
  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const containerAccessRepository = await getContainerAccessRepository();
  const containerRepository = await getContainerRepository();
  const dataViewRepository = await getDataViewRepository();
  const fileUsageRepository = await getFileUsageRepository();
  const memberScopedContainerRepository = await getMemberScopedContainerRepository();
  const pageRevisionRepository = await getPageRevisionRepository();
  const uploadedFileRepository = await getUploadedFileRepository();
  const webhookRepository = await getWebhookRepository();
  const webhookDeliveryRepository = await getWebhookDeliveryRepository();
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const workspaceRepository = await getWorkspaceRepository();
  const workspaceSlugRedirectRepository = await getWorkspaceSlugRedirectRepository();

  // page-revision: workspace-scoped directly.
  const pageRevisions = await pageRevisionRepository.getByQuery(
    pageRevisionRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of pageRevisions) {
    await pageRevisionRepository.deleteUsingId(row.id);
  }

  // member-scoped-container: resolved via this workspace's WorkspaceMember ids.
  const workspaceMembers = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', workspaceId)
  );
  const workspaceMemberIds = workspaceMembers.map((member) => member.id);
  let memberScopedContainers = 0;
  if (workspaceMemberIds.length > 0) {
    const rows = await memberScopedContainerRepository.getByQuery(
      memberScopedContainerRepository.createQuery().in('workspaceMemberId', workspaceMemberIds)
    );
    for (const row of rows) {
      await memberScopedContainerRepository.deleteUsingId(row.id);
    }
    memberScopedContainers = rows.length;
  }

  // app-scoped-container / api-key / webhook-delivery: resolved via this workspace's App ids.
  const apps = await appRepository.getByQuery(appRepository.createQuery().eq('workspaceId', workspaceId));
  const appIds = apps.map((app) => app.id);

  let appScopedContainers = 0;
  let apiKeys = 0;
  let webhookDeliveries = 0;
  if (appIds.length > 0) {
    const appScopedContainerRows = await appScopedContainerRepository.getByQuery(
      appScopedContainerRepository.createQuery().in('appId', appIds)
    );
    for (const row of appScopedContainerRows) {
      await appScopedContainerRepository.deleteUsingId(row.id);
    }
    appScopedContainers = appScopedContainerRows.length;

    const apiKeyRows = await apiKeyRepository.getByQuery(apiKeyRepository.createQuery().in('appId', appIds));
    for (const row of apiKeyRows) {
      await apiKeyRepository.deleteUsingId(row.id);
    }
    apiKeys = apiKeyRows.length;

    const webhookDeliveryRows = await webhookDeliveryRepository.getByQuery(
      webhookDeliveryRepository.createQuery().in('appId', appIds)
    );
    for (const row of webhookDeliveryRows) {
      await webhookDeliveryRepository.deleteUsingId(row.id);
    }
    webhookDeliveries = webhookDeliveryRows.length;
  }

  // webhook: workspace-scoped directly (denormalised from the parent App).
  const webhooks = await webhookRepository.getByQuery(webhookRepository.createQuery().eq('workspaceId', workspaceId));
  for (const row of webhooks) {
    await webhookRepository.deleteUsingId(row.id);
  }

  // app: workspace-scoped directly.
  for (const app of apps) {
    await appRepository.deleteUsingId(app.id);
  }

  // workspace-member: workspace-scoped directly.
  for (const member of workspaceMembers) {
    await workspaceMemberRepository.deleteUsingId(member.id);
  }

  // container-access: workspace-scoped directly.
  const containerAccessRows = await containerAccessRepository.getByQuery(
    containerAccessRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of containerAccessRows) {
    await containerAccessRepository.deleteUsingId(row.id);
  }

  // file-usage: workspace-scoped directly.
  const fileUsageRows = await fileUsageRepository.getByQuery(
    fileUsageRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of fileUsageRows) {
    await fileUsageRepository.deleteUsingId(row.id);
  }

  // uploaded-file: workspace-scoped directly. Storage bytes are removed best-effort — a failure
  // never blocks the rest of the workspace cascade (unlike the dedicated file-purge handler).
  const uploadedFileRows = await uploadedFileRepository.getByQuery(
    uploadedFileRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of uploadedFileRows) {
    if (options.deleteStorageBytes) {
      try {
        await options.deleteStorageBytes(row.storageKey);
      } catch (error) {
        options.onStorageDeleteError?.(row.id, row.storageKey, error);
      }
    }
    await uploadedFileRepository.deleteUsingId(row.id);
  }

  // dataView: workspace-scoped directly.
  const dataViews = await dataViewRepository.getByQuery(
    dataViewRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of dataViews) {
    await dataViewRepository.deleteUsingId(row.id);
  }

  // container: workspace-scoped directly.
  const containers = await containerRepository.getByQuery(
    containerRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of containers) {
    await containerRepository.deleteUsingId(row.id);
  }

  // workspace-slug-redirect: workspace-scoped directly.
  const redirects = await workspaceSlugRedirectRepository.getByQuery(
    workspaceSlugRedirectRepository.createQuery().eq('workspaceId', workspaceId)
  );
  for (const row of redirects) {
    await workspaceSlugRedirectRepository.deleteUsingId(row.id);
  }

  // The workspace row itself, last.
  await workspaceRepository.deleteUsingId(workspaceId);

  return {
    pageRevisions: pageRevisions.length,
    memberScopedContainers,
    appScopedContainers,
    apiKeys,
    webhookDeliveries,
    webhooks: webhooks.length,
    apps: apps.length,
    workspaceMembers: workspaceMembers.length,
    containerAccess: containerAccessRows.length,
    fileUsages: fileUsageRows.length,
    uploadedFiles: uploadedFileRows.length,
    dataViews: dataViews.length,
    containers: containers.length,
    workspaceSlugRedirects: redirects.length,
  };
}
