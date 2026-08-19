import { getContainerAccessRepository } from './repositories.js';

type NewPageForAccess = {
  id: string;
  parentId: string | null;
  workspaceId: string;
  createdAt: string;
};

/**
 * Creates the initial `ContainerAccess` row for a newly created page, owned by the creating
 * user. `lastAccessedAt` is initialized to the page's own `createdAt` so every page has an
 * access record from the moment it exists — this is what lets the root-list pagination query
 * in `GET /pages/tree` be a clean single-table cursor query, with no in-memory join against
 * `Container` needed to determine which rows are root-level.
 *
 * Assumption: only the creating/owning user needs a `ContainerAccess` row, consistent with
 * pages currently being single-user-owned per the existing `addUserIdToQuery` scoping
 * throughout the codebase.
 */
export async function registerContainerAccessForNewPage(page: NewPageForAccess, userId: string): Promise<void> {
  const containerAccessRepository = await getContainerAccessRepository();
  await containerAccessRepository.create({
    userId,
    containerId: page.id,
    parentId: page.parentId || null,
    workspaceId: page.workspaceId,
    lastAccessedAt: page.createdAt,
    starred: false,
    starredAt: null,
    createdAt: page.createdAt,
  });
}

/** Records an explicit access without disturbing a user's favourite metadata. */
export async function touchContainerAccess(page: NewPageForAccess, userId: string, accessedAt: string): Promise<void> {
  const repository = await getContainerAccessRepository();
  const existing = await repository.getOneByQuery(
    repository.createQuery().eq('containerId', page.id).eq('userId', userId)
  );
  if (existing) {
    await repository.update({
      ...existing,
      parentId: page.parentId ?? null,
      workspaceId: page.workspaceId,
      lastAccessedAt: accessedAt,
    });
    return;
  }
  await repository.create({
    userId,
    containerId: page.id,
    parentId: page.parentId ?? null,
    workspaceId: page.workspaceId,
    lastAccessedAt: accessedAt,
    starred: false,
    starredAt: null,
    createdAt: accessedAt,
  });
}

/** Keeps denormalised parent snapshots correct for every user after a page move. */
export async function syncContainerAccessParent(
  page: Pick<NewPageForAccess, 'id' | 'parentId' | 'workspaceId'>
): Promise<void> {
  const repository = await getContainerAccessRepository();
  const rows = await repository.getByQuery(repository.createQuery().eq('containerId', page.id));
  await Promise.all(
    rows.map((row) => repository.update({ ...row, parentId: page.parentId ?? null, workspaceId: page.workspaceId }))
  );
}
