import { getApiKeyRepository, getAppScopedContainerRepository, getContainerRepository } from '.';
import { resolveContainerDescendants } from './app-service';
import type { App, AppScopeType } from '@thoth/database/types';
import type { AppContainerSummary, AppResponse } from '@/types/api';

/**
 * Hydrates the `containers` + `keyCount` fields shared by every `AppResponse` (list and
 * detail). `includeChildCount` additionally resolves a per-root descendant count for
 * `scopeType === 'containers_with_children'` — only worth the extra query on the single-App
 * detail endpoint, not the list endpoint.
 */
export async function hydrateAppResponse(
  app: App,
  options: { includeChildCount?: boolean } = {}
): Promise<AppResponse> {
  const [containers, keyCount] = await Promise.all([
    hydrateAppContainers(app, options.includeChildCount ?? false),
    countAppKeys(app.id),
  ]);

  return {
    id: app.id,
    workspaceId: app.workspaceId,
    label: app.label,
    permission: app.permission,
    scopeType: app.scopeType,
    attributionMode: app.attributionMode,
    archivedAt: app.archivedAt,
    createdAt: app.createdAt,
    lastUpdated: app.lastUpdated,
    ...(containers && { containers }),
    keyCount,
  };
}

async function hydrateAppContainers(app: App, includeChildCount: boolean): Promise<AppContainerSummary[] | undefined> {
  if (app.scopeType === 'workspace') {
    return undefined;
  }

  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const scopedRows = await appScopedContainerRepository.getByQuery(
    appScopedContainerRepository.createQuery().eq('appId', app.id)
  );

  if (scopedRows.length === 0) {
    return [];
  }

  const containerIds = scopedRows.map((row) => row.containerId);
  const containerRepository = await getContainerRepository();
  const containers = await containerRepository.getByQuery(containerRepository.createQuery().in('id', containerIds));

  let childCountByContainer: Map<string, number> | undefined;
  if (includeChildCount && app.scopeType === ('containers_with_children' satisfies AppScopeType)) {
    childCountByContainer = new Map();
    for (const containerId of containerIds) {
      const descendants = await resolveContainerDescendants([containerId], app.workspaceId);
      childCountByContainer.set(containerId, descendants.size);
    }
  }

  return containers.map((container) => ({
    id: container.id,
    name: container.name,
    type: container.type,
    ...(childCountByContainer && { childCount: childCountByContainer.get(container.id) ?? 0 }),
  }));
}

async function countAppKeys(appId: string): Promise<number> {
  const apiKeyRepository = await getApiKeyRepository();
  const keys = await apiKeyRepository.getByQuery(apiKeyRepository.createQuery().eq('appId', appId));
  return keys.length;
}
