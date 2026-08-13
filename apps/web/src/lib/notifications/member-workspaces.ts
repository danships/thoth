import { getWorkspaceMemberRepository } from '@/lib/database';

/**
 * Returns the set of workspace ids the user is currently a member of. Notifications and rules
 * are per-user state, but a user may lose membership after an item was created — so every
 * cross-workspace inbox read is intersected with this set so revoked-membership rows never leak
 * (THOTH-066).
 */
export async function getMemberWorkspaceIds(userId: string): Promise<Set<string>> {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const memberships = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('userId', userId)
  );
  return new Set(memberships.map((membership) => membership.workspaceId));
}
