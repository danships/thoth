import { getContainerRepository } from '@/lib/database';
import { getMaxSiblingSortOrder, getMinSiblingSortOrder } from '@/lib/database/sort-order-service';
import { addWorkspaceIdToQuery } from '@/lib/database/helpers';
import {
  assertGrantAllowsContainerForSession,
  assertGrantAllowsWrite,
  memberToAccessGrant,
} from '@/lib/auth/access-grant';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { collectDescendantPageIds } from '@/lib/database/soft-delete-service';
import { generateKeyBetween } from 'fractional-indexing';
import type { ApiKeySession } from '@/lib/auth/session';
import type { DataSourceContainer, PageContainer } from '@thoth/database/types';

export async function resolveMoveCopyDestination(
  session: ApiKeySession,
  source: PageContainer,
  parentId: string | null
): Promise<PageContainer | DataSourceContainer | null> {
  if (!parentId) {
    const member = await assertWorkspaceAccess(session.user.id, source.workspaceId);
    const grant = session.appContext?.accessGrant ?? (await memberToAccessGrant(member));
    assertGrantAllowsWrite(grant);
    if (grant.scopeType !== 'workspace') {
      const { ForbiddenError } = await import('@/lib/errors/forbidden-error');
      throw new ForbiddenError('Workspace root is outside the grant scope');
    }
    return null;
  }
  const repository = await getContainerRepository();
  const parent = await repository.getOneByQuery(
    addWorkspaceIdToQuery(repository.createQuery().eq('id', parentId), source.workspaceId)
  );
  if (!parent || (parent.type !== 'page' && parent.type !== 'data-source') || parent.deletedAt)
    throw new NotFoundError('Destination not found');
  await assertGrantAllowsContainerForSession(session, parent, { mutating: true });
  return parent;
}

export async function destinationSortOrder(
  workspaceId: string,
  destination: PageContainer | DataSourceContainer | null
): Promise<string | null> {
  if (!destination) return null;
  return destination.type === 'data-source'
    ? generateKeyBetween(await getMaxSiblingSortOrder(workspaceId, destination.id), null)
    : generateKeyBetween(null, await getMinSiblingSortOrder(workspaceId, destination.id));
}

export async function assertNoMoveCycle(
  source: PageContainer,
  destination: PageContainer | DataSourceContainer | null
): Promise<void> {
  if (!destination || destination.type !== 'page') return;
  const descendants = await collectDescendantPageIds(source.id, source.workspaceId);
  if (destination.id === source.id || descendants.includes(destination.id)) throw new Error('MOVE_CYCLE');
}

export function toPageResponse(page: PageContainer) {
  return {
    id: page.id,
    name: page.name,
    emoji: page.emoji ?? null,
    cover: page.cover ?? null,
    parentId: page.parentId ?? null,
    sortOrder: page.sortOrder ?? null,
    isPrivate: page.isPrivate,
    privateRootId: page.privateRootId ?? null,
    createdAt: page.createdAt,
    lastUpdated: page.lastUpdated,
  };
}
