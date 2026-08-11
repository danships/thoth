import type { Query } from 'supersave';

/**
 * Scopes a query to rows created by `userId`. **Per-user state only** (e.g. `ContainerAccess`
 * starred/last-accessed) — never use this to gate CONTENT rows (`Container` pages/data-sources,
 * `DataView`). `userId` on content is attribution/provenance, not an access gate: a fellow
 * workspace member must be able to read/write content another member created. Content access is
 * enforced via workspace membership (`assertWorkspaceAccess`) + grant (`assertContentAccess` /
 * `assertGrantAllowsContainerForSession`), scoped with `addWorkspaceIdToQuery` below (THOTH-042).
 */
export const addUserIdToQuery = (query: Query, userId: string) => {
  return query.eq('userId', userId);
};

// The content-scoping helper: gate CONTENT rows (Container, DataView) by workspace, then assert
// membership + grant — never by creator (`addUserIdToQuery`).
export const addWorkspaceIdToQuery = (query: Query, workspaceId: string) => {
  return query.eq('workspaceId', workspaceId);
};
