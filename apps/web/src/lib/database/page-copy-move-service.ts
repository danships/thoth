import { getContainerRepository, getMinSiblingSortOrder } from '@/lib/database';
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
import type { PageContainer } from '@thoth/database/types';

export async function resolveMoveCopyDestination(
  session: ApiKeySession,
  source: PageContainer,
  parentId: string | null
) {
  if (!parentId) {
    const member = await assertWorkspaceAccess(session.user.id, source.workspaceId);
    assertGrantAllowsWrite(session.appContext?.accessGrant ?? (await memberToAccessGrant(member)));
    return null;
  }
  const repository = await getContainerRepository();
  const parent = await repository.getOneByQuery(
    addWorkspaceIdToQuery(repository.createQuery().eq('id', parentId).eq('type', 'page'), source.workspaceId)
  );
  if (!parent || parent.type !== 'page' || parent.deletedAt) throw new NotFoundError('Destination page not found');
  await assertGrantAllowsContainerForSession(session, parent, { mutating: true });
  return parent;
}

export async function destinationSortOrder(workspaceId: string, parentId: string | null): Promise<string | null> {
  if (!parentId) return null;
  return generateKeyBetween(null, await getMinSiblingSortOrder(workspaceId, parentId));
}

export async function assertNoMoveCycle(source: PageContainer, parentId: string | null): Promise<void> {
  if (!parentId) return;
  const descendants = await collectDescendantPageIds(source.id, source.workspaceId);
  if (parentId === source.id || descendants.includes(parentId)) throw new Error('MOVE_CYCLE');
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
