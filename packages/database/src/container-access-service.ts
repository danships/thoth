import { getContainerAccessRepository } from './repositories';

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
