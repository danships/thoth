import { getAppScopedContainerRepository, getMemberScopedContainerRepository } from './repositories';
import { resolveContainerDescendants, resolvePageEmbeddedContainerIds } from './app-service';
import type { App, AppPermission, AppScopeType, WorkspaceMember } from './types';

/**
 * Environment-neutral `AccessGrant` primitives (THOTH-061), moved here from
 * `apps/web/src/lib/auth/access-grant.ts` so both the web process and `@thoth/jobs` can resolve
 * the same App/member scope semantics without either depending on the other. Session-aware,
 * throwing wrappers (`assertGrantAllowsContainer`, `assertGrantAllowsContainerForSession`,
 * `filterContainersByGrantForSession`, ...) stay in `apps/web` — they need `ForbiddenError` and
 * the web-only `ApiKeySession` type, neither of which belongs in a shared package.
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

/** Mirrors `appToAccessGrant` for a workspace-member row — see `memberToAccessGrant` in web. */
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

/**
 * Non-throwing predicate: does `grant` cover `container`? Used both by web's
 * `assertGrantAllowsContainer` (throwing wrapper) and by `@thoth/jobs`' webhook dispatch handler,
 * which needs to test many (grant, container) pairs and simply keep/discard.
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
 * Filters a list of containers down to the ones `grant` permits. See `grantAllowsContainer` for
 * the per-container semantics; this resolves the descendant/embedded set once for the whole
 * list rather than once per item.
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
    const embedded = await resolvePageEmbeddedContainerIds([...scopedContainerIds], grant.workspaceId);
    return scoped.filter((container) => scopedContainerIds.has(container.id) || embedded.has(container.id));
  }

  // 'containers_with_children'
  const descendants = await resolveContainerDescendants([...scopedContainerIds], grant.workspaceId);
  return scoped.filter((container) => scopedContainerIds.has(container.id) || descendants.has(container.id));
}
