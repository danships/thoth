import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { NotFoundError } from '@/lib/errors/not-found-error';
import type { WorkspaceMember } from '@/types/database';

/**
 * The single authorization boundary for workspace-scoped data: answers only "is this user
 * allowed in this workspace at all" — never "is this user allowed to see this specific piece
 * of content". Route handlers must call this as a discrete step (never inline it into
 * query-building logic) so a future, additive `assertContentAccess(userId, container)` check
 * can be layered in *after* this succeeds, once per-content visibility restrictions are needed
 * for collaboration (see THOTH-027 spec, "Future-Proofing: per-content visibility").
 *
 * Always throws `NotFoundError` (never 403) — for a non-member, an unknown workspace, and a
 * soft-deleted workspace alike — so a caller can never distinguish "doesn't exist" from
 * "exists but you're not allowed in", which would otherwise leak workspace/resource existence.
 */
export async function assertWorkspaceAccess(userId: string, workspaceId: string): Promise<WorkspaceMember> {
  const workspaceRepository = await getWorkspaceRepository();
  const workspace = await workspaceRepository.getOneByQuery(workspaceRepository.createQuery().eq('id', workspaceId));

  if (!workspace || workspace.deletedAt) {
    throw new NotFoundError('Workspace not found');
  }

  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const membership = await workspaceMemberRepository.getOneByQuery(
    workspaceMemberRepository.createQuery().eq('workspaceId', workspaceId).eq('userId', userId)
  );

  if (!membership) {
    throw new NotFoundError('Workspace not found');
  }

  return membership;
}
