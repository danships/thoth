import { getWorkspaceMemberRepository } from '@/lib/database';
import { memberToAccessGrant, grantAllowsContainer, type AccessGrant } from '@/lib/auth/access-grant';

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

/**
 * Resolves one `AccessGrant` per workspace the caller is currently a member of (THOTH-042/
 * THOTH-066). A stale membership row can outlive a `ContainerAccess`-scoped grant reduction —
 * every notification route that exposes per-notification state (title/body/id/unread counts)
 * must re-check the *current* grant for the notification's target container, not just
 * workspace membership, before returning it.
 */
export async function getMemberAccessGrantsByWorkspace(userId: string): Promise<Map<string, AccessGrant>> {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const memberships = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('userId', userId)
  );

  const grantsByWorkspaceId = new Map<string, AccessGrant>();
  for (const member of memberships) {
    grantsByWorkspaceId.set(member.workspaceId, await memberToAccessGrant(member));
  }
  return grantsByWorkspaceId;
}

/**
 * True when `userId`'s current grant for `row.workspaceId` allows the notification's target
 * container (`row.containerId`). Rows whose workspace membership was already lost are filtered
 * out by checking `grantsByWorkspaceId.has(row.workspaceId)` before this is ever called; this
 * only covers the narrower "still a member, but scope was reduced" case.
 */
export async function notificationAllowedByGrant(
  grantsByWorkspaceId: Map<string, AccessGrant>,
  row: { workspaceId: string; containerId: string }
): Promise<boolean> {
  const grant = grantsByWorkspaceId.get(row.workspaceId);
  if (!grant) {
    return false;
  }
  return grantAllowsContainer(grant, { id: row.containerId, workspaceId: row.workspaceId });
}
