import { getAppScopedContainerRepository, getMemberScopedContainerRepository } from '@/lib/database';
import { resolveContainerDescendants, resolvePageEmbeddedContainerIds } from '@/lib/database/app-service';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import type { App, AppPermission, AppScopeType, WorkspaceMember } from '@/types/database';
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
 */
export type AccessGrant = {
  workspaceId: string;
  permission: AppPermission;
  scopeType: AppScopeType;
  scopedContainerIds?: string[];
};

export async function appToAccessGrant(app: App): Promise<AccessGrant> {
  if (app.scopeType === 'workspace') {
    return {
      workspaceId: app.workspaceId,
      permission: app.permission,
      scopeType: app.scopeType,
    };
  }

  const appScopedContainerRepository = await getAppScopedContainerRepository();
  const scopedRows = await appScopedContainerRepository.getByQuery(
    appScopedContainerRepository.createQuery().eq('appId', app.id)
  );

  return {
    workspaceId: app.workspaceId,
    permission: app.permission,
    scopeType: app.scopeType,
    scopedContainerIds: scopedRows.map((row) => row.containerId),
  };
}

/**
 * Builds the same `AccessGrant` shape from a workspace-member row, so human members and App
 * keys flow through the identical scope/permission checks (`assertGrantAllowsContainer` /
 * `filterContainersByGrant` / `assertGrantAllowsWrite`). Mirrors `appToAccessGrant`. Called by
 * `assertContentAccess` — never call this ahead of time and cache it, since a user's grant
 * differs per workspace and must be resolved from the member row for the *target* workspace.
 */
export async function memberToAccessGrant(member: WorkspaceMember): Promise<AccessGrant> {
  if (member.scopeType === 'workspace') {
    return {
      workspaceId: member.workspaceId,
      permission: member.permission,
      scopeType: member.scopeType,
    };
  }

  const memberScopedContainerRepository = await getMemberScopedContainerRepository();
  const scopedRows = await memberScopedContainerRepository.getByQuery(
    memberScopedContainerRepository.createQuery().eq('workspaceMemberId', member.id)
  );

  return {
    workspaceId: member.workspaceId,
    permission: member.permission,
    scopeType: member.scopeType,
    scopedContainerIds: scopedRows.map((row) => row.containerId),
  };
}

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
 * Non-throwing predicate version of `assertGrantAllowsContainer` — used by
 * `src/lib/webhooks/resolve-webhooks.ts`'s resolver, which needs to test many (grant, container)
 * pairs and simply keep/discard rather than catch an exception per pair. `assertGrantAllowsContainer`
 * throws ⇔ this returns `false`; kept in perfect parity by having the throwing wrapper delegate here.
 */
export async function grantAllowsContainer(
  grant: AccessGrant,
  container: { id: string; workspaceId: string }
): Promise<boolean> {
  if (grant.workspaceId !== container.workspaceId) {
    return false;
  }

  if (grant.scopeType === 'workspace') {
    return true;
  }

  const scopedContainerIds = grant.scopedContainerIds ?? [];

  if (grant.scopeType === 'containers') {
    if (scopedContainerIds.includes(container.id)) {
      return true;
    }
    // Data sources are never granted on their own — access to a page implicitly covers the
    // data source(s) embedded on it and the rows they display.
    const embedded = await resolvePageEmbeddedContainerIds(scopedContainerIds, grant.workspaceId);
    return embedded.has(container.id);
  }

  // 'containers_with_children'
  if (scopedContainerIds.includes(container.id)) {
    return true;
  }

  const descendants = await resolveContainerDescendants(scopedContainerIds, grant.workspaceId);
  return descendants.has(container.id);
}

/**
 * Filters a list of containers down to the ones `grant` permits — used by list/tree routes
 * (e.g. `GET /pages/tree`) so an App-authenticated caller can never enumerate out-of-scope
 * containers via a listing endpoint, even if they can't fetch them individually. For
 * `'containers_with_children'`, resolves the descendant set once and filters the whole list
 * against it (rather than one lookup per item).
 */
export async function filterContainersByGrant<T extends { id: string; workspaceId: string }>(
  grant: AccessGrant,
  containers: T[]
): Promise<T[]> {
  const scoped = containers.filter((container) => container.workspaceId === grant.workspaceId);

  if (grant.scopeType === 'workspace') {
    return scoped;
  }

  const scopedContainerIds = new Set(grant.scopedContainerIds);

  if (grant.scopeType === 'containers') {
    // See `assertGrantAllowsContainer`: page scope implicitly covers embedded data sources/rows.
    const embedded = await resolvePageEmbeddedContainerIds([...scopedContainerIds], grant.workspaceId);
    return scoped.filter((container) => scopedContainerIds.has(container.id) || embedded.has(container.id));
  }

  // 'containers_with_children'
  const descendants = await resolveContainerDescendants([...scopedContainerIds], grant.workspaceId);
  return scoped.filter((container) => scopedContainerIds.has(container.id) || descendants.has(container.id));
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
