import { getAppScopedContainerRepository } from '@/lib/database';
import { resolveContainerDescendants } from '@/lib/database/app-service';
import { ForbiddenError } from '@/lib/errors/forbidden-error';
import type { App, AppPermission, AppScopeType } from '@/types/database';

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

export function assertGrantAllowsWrite(grant: AccessGrant): void {
  if (grant.permission === 'read') {
    throw new ForbiddenError('This API key is read-only');
  }
}

export async function assertGrantAllowsContainer(
  grant: AccessGrant,
  container: { id: string; workspaceId: string }
): Promise<void> {
  if (grant.workspaceId !== container.workspaceId) {
    throw new ForbiddenError('Container is outside the API key scope');
  }

  if (grant.scopeType === 'workspace') {
    return;
  }

  const scopedContainerIds = grant.scopedContainerIds ?? [];

  if (grant.scopeType === 'containers') {
    if (!scopedContainerIds.includes(container.id)) {
      throw new ForbiddenError('Container is outside the API key scope');
    }
    return;
  }

  // 'containers_with_children'
  if (scopedContainerIds.includes(container.id)) {
    return;
  }

  const descendants = await resolveContainerDescendants(scopedContainerIds, grant.workspaceId);
  if (!descendants.has(container.id)) {
    throw new ForbiddenError('Container is outside the API key scope');
  }
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
    return scoped.filter((container) => scopedContainerIds.has(container.id));
  }

  // 'containers_with_children'
  const descendants = await resolveContainerDescendants([...scopedContainerIds], grant.workspaceId);
  return scoped.filter((container) => scopedContainerIds.has(container.id) || descendants.has(container.id));
}

/**
 * Session-aware convenience wrapper around `assertGrantAllowsContainer`: no-ops when the
 * caller authenticated via a session cookie (`session.appContext` undefined) so session-cookie
 * requests are byte-for-byte unaffected by this ticket's changes; only enforces the grant for
 * bearer-token (App-key) callers. Every container-scoped route handler should call this
 * immediately after its existing retriever call.
 */
export async function assertGrantAllowsContainerForSession(
  session: { appContext?: { accessGrant: AccessGrant } },
  container: { id: string; workspaceId: string }
): Promise<void> {
  if (!session.appContext) {
    return;
  }
  await assertGrantAllowsContainer(session.appContext.accessGrant, container);
}

/**
 * Session-aware convenience wrapper around `filterContainersByGrant`: returns `containers`
 * unchanged for session-cookie callers, and filters them down to the App's scope for
 * bearer-token callers. Used by list/tree routes (e.g. `GET /pages/tree`, `GET /pages`).
 */
export async function filterContainersByGrantForSession<T extends { id: string; workspaceId: string }>(
  session: { appContext?: { accessGrant: AccessGrant } },
  containers: T[]
): Promise<T[]> {
  if (!session.appContext) {
    return containers;
  }
  return filterContainersByGrant(session.appContext.accessGrant, containers);
}
