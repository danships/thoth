import { ForbiddenError } from '@/lib/errors/forbidden-error';
import { grantAllowsContainer, filterContainersByGrant, memberToAccessGrant } from '@thoth/database';
import type { AccessGrant } from '@thoth/database';
import type { ApiKeySession } from './session';

/**
 * The single, sole authorization chokepoint for App-key permission/scope enforcement in the
 * THOTH-026 spec ("Apps"/API keys). No route should re-implement this logic inline — anything
 * that needs to check whether an App-authenticated caller may read/write a container must call
 * `assertGrantAllowsContainer`/`filterContainersByGrant` (or, for the write-permission check,
 * `assertGrantAllowsWrite`) from this file.
 *
 * This sits *on top of*, not instead of, the workspace-membership chokepoint
 * (`assertWorkspaceAccess`, in `src/lib/api/server/workspace-access.ts`) that the retrievers
 * already enforce for every caller (session or bearer-token alike): membership first, then
 * per-content scope. Permission/scope violations here throw `ForbiddenError` (403) — never
 * `NotAuthorizedError` (401), which is reserved for "who even are you" failures.
 *
 * The non-throwing `AccessGrant` primitives (`appToAccessGrant`, `memberToAccessGrant`,
 * `grantAllowsContainer`, `filterContainersByGrant`) moved to `@thoth/database` in THOTH-061 so
 * `@thoth/jobs`' webhook dispatch handler can resolve the exact same scope semantics without
 * depending on this web-only module. Only the throwing/session-aware wrappers stay here.
 */
export { appToAccessGrant, memberToAccessGrant, grantAllowsContainer, filterContainersByGrant } from '@thoth/database';
export type { AccessGrant } from '@thoth/database';

export function assertGrantAllowsWrite(grant: AccessGrant): void {
  if (grant.permission === 'read') {
    throw new ForbiddenError('This API key is read-only');
  }
}

export async function assertGrantAllowsContainer(
  grant: AccessGrant,
  container: { id: string; workspaceId: string }
): Promise<void> {
  if (!(await grantAllowsContainer(grant, container))) {
    throw new ForbiddenError('Container is outside the API key scope');
  }
}

/**
 * Session-aware convenience wrapper around `assertGrantAllowsContainer`. Delegates to
 * `assertContentAccess` (the canonical chokepoint in
 * `src/lib/api/server/workspace-access.ts`), which resolves the caller's grant uniformly for
 * App keys and human workspace members alike — so, unlike before THOTH-042, this now *does*
 * enforce real scope/permission for session-cookie callers too, not just a no-op. Every
 * container-scoped route handler should call this immediately after its existing retriever
 * call, passing `{ mutating: true }` on mutating routes (PATCH/PUT/DELETE, and any POST that
 * mutates existing content) so a read-only grant is rejected with `ForbiddenError` (403).
 */
export async function assertGrantAllowsContainerForSession(
  session: ApiKeySession,
  container: { id: string; workspaceId: string },
  options?: { mutating?: boolean }
): Promise<void> {
  // Local require avoids a static import cycle with `workspace-access.ts` (which itself imports
  // from this file for the primitives `assertContentAccess` composes).
  const { assertContentAccess } = await import('@/lib/api/server/workspace-access');
  await assertContentAccess(session, container, options);
}

/**
 * Session-aware convenience wrapper around `filterContainersByGrant`: used by list/tree routes
 * (e.g. `GET /pages/tree`, `GET /pages`). Filters App-key callers by their App grant as before;
 * for a session-cookie (human member) caller, resolves that member's `AccessGrant` (via the
 * first container's `workspaceId` — every caller of this helper already scopes its list to a
 * single workspace) and filters by it too, instead of no-op'ing.
 */
export async function filterContainersByGrantForSession<T extends { id: string; workspaceId: string }>(
  session: ApiKeySession,
  containers: T[]
): Promise<T[]> {
  if (session.appContext) {
    return filterContainersByGrant(session.appContext.accessGrant, containers);
  }
  if (containers.length === 0) {
    return containers;
  }

  const { assertWorkspaceAccess } = await import('@/lib/api/server/workspace-access');
  const member = await assertWorkspaceAccess(session.user.id, containers[0]!.workspaceId);
  const grant = await memberToAccessGrant(member);
  return filterContainersByGrant(grant, containers);
}
