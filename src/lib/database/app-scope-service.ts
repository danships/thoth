import { getAppScopedContainerRepository, getContainerRepository } from './index';
import { BadRequestError } from '@/lib/errors/bad-request-error';

/**
 * Guards against a `containerId` spanning a different workspace than the App being
 * created/updated, or referencing a container that doesn't exist — every scoped container
 * must belong to the App's own `workspaceId`.
 */
export async function assertContainerIdsBelongToWorkspace(containerIds: string[], workspaceId: string): Promise<void> {
  if (containerIds.length === 0) {
    throw new BadRequestError('containerIds must be non-empty when scopeType is not "workspace"');
  }

  const containerRepository = await getContainerRepository();
  const containers = await containerRepository.getByQuery(containerRepository.createQuery().in('id', containerIds));

  if (containers.length !== containerIds.length) {
    throw new BadRequestError('One or more containerIds do not exist');
  }

  const outsideWorkspace = containers.some((container) => container.workspaceId !== workspaceId);
  if (outsideWorkspace) {
    throw new BadRequestError('All containerIds must belong to the App workspace');
  }
}

/**
 * Deletes every existing `AppScopedContainer` row for `appId` and recreates the full set from
 * `containerIds` — used both at App creation and whenever `PATCH /apps/:id` supplies a new
 * `containerIds` array (delete-then-recreate, no diffing).
 */
export async function replaceScopedContainers(appId: string, containerIds: string[]): Promise<void> {
  const appScopedContainerRepository = await getAppScopedContainerRepository();

  const existing = await appScopedContainerRepository.getByQuery(
    appScopedContainerRepository.createQuery().eq('appId', appId)
  );
  for (const row of existing) {
    await appScopedContainerRepository.deleteUsingId(row.id);
  }

  const now = new Date().toISOString();
  for (const containerId of containerIds) {
    await appScopedContainerRepository.create({
      appId,
      containerId,
      createdAt: now,
    });
  }
}

/** Deletes every `AppScopedContainer` row for `appId` (used when switching to `scopeType: 'workspace'`). */
export async function clearScopedContainers(appId: string): Promise<void> {
  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const existing = await appScopedContainerRepository.getByQuery(
    appScopedContainerRepository.createQuery().eq('appId', appId)
  );
  for (const row of existing) {
    await appScopedContainerRepository.deleteUsingId(row.id);
  }
}

/** Deletes every `AppScopedContainer` row referencing `containerId` (used on container delete). */
export async function deleteScopedContainerReferences(containerId: string): Promise<void> {
  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const existing = await appScopedContainerRepository.getByQuery(
    appScopedContainerRepository.createQuery().eq('containerId', containerId)
  );
  for (const row of existing) {
    await appScopedContainerRepository.deleteUsingId(row.id);
  }
}
