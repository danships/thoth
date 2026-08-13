import { getAppScopedContainerRepository, getContainerRepository } from './repositories.js';

/**
 * Thrown by `assertContainerIdsBelongToWorkspace` when one or more `containerIds` don't exist,
 * or exist but belong to a different workspace. This is a plain domain error, not an
 * HTTP-status-coupled one — the database package has no notion of HTTP semantics. Callers at
 * the API boundary (e.g. `apps/web/src/app/api/v1/apps/*`) should catch it and translate it
 * into the appropriate `BadRequestError` (400).
 */
export class InvalidContainerIdsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidContainerIdsError';
  }
}

/**
 * Guards against a `containerId` spanning a different workspace than the App being
 * created/updated, or referencing a container that doesn't exist — every scoped container
 * must belong to the App's own `workspaceId`. An empty `containerIds` array is valid: pages
 * can be granted access later, individually, from the page detail screen's "Apps" menu.
 */
export async function assertContainerIdsBelongToWorkspace(containerIds: string[], workspaceId: string): Promise<void> {
  if (containerIds.length === 0) {
    return;
  }

  const containerRepository = await getContainerRepository();
  const containers = await containerRepository.getByQuery(containerRepository.createQuery().in('id', containerIds));

  if (containers.length !== containerIds.length) {
    throw new InvalidContainerIdsError('One or more containerIds do not exist');
  }

  const outsideWorkspace = containers.some((container) => container.workspaceId !== workspaceId);
  if (outsideWorkspace) {
    throw new InvalidContainerIdsError('All containerIds must belong to the App workspace');
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

/**
 * Adds a single `AppScopedContainer` row connecting `appId` to `containerId`, unless one
 * already exists — used by `POST /pages/:id/apps` so a page can be individually granted to a
 * `containers`/`containers_with_children`-scoped App without disturbing any of the App's other
 * scoped containers (unlike `replaceScopedContainers`, which is a full delete-then-recreate).
 */
export async function addScopedContainer(appId: string, containerId: string): Promise<void> {
  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const existing = await appScopedContainerRepository.getOneByQuery(
    appScopedContainerRepository.createQuery().eq('appId', appId).eq('containerId', containerId)
  );

  if (existing) {
    return;
  }

  await appScopedContainerRepository.create({
    appId,
    containerId,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Removes the single `AppScopedContainer` row connecting `appId` to `containerId`, if any —
 * the inverse of `addScopedContainer`, used by `DELETE /pages/:id/apps/:appId`.
 */
export async function removeScopedContainer(appId: string, containerId: string): Promise<void> {
  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const existing = await appScopedContainerRepository.getOneByQuery(
    appScopedContainerRepository.createQuery().eq('appId', appId).eq('containerId', containerId)
  );

  if (existing) {
    await appScopedContainerRepository.deleteUsingId(existing.id);
  }
}
