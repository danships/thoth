import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { NotFoundError } from '@/lib/errors/not-found-error';
import {
  assertGrantAllowsContainer,
  assertGrantAllowsWrite,
  memberToAccessGrant,
  type AccessGrant,
} from '@/lib/auth/access-grant';
import type { WorkspaceMember } from '@/types/database';
import type { ApiKeySession } from '@/lib/auth/session';

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

/**
 * The single per-content access chokepoint (THOTH-042), layered on top of workspace membership.
 * Resolves ONE `AccessGrant` regardless of caller type:
 *   - App/bearer callers: `session.appContext.accessGrant` (already resolved at auth time).
 *   - Human members: `memberToAccessGrant(member)`, built lazily from the `workspace-member` row
 *     `assertWorkspaceAccess` returns (keyed by `session.user.id` + `container.workspaceId` — a
 *     user may belong to many workspaces, so the grant can only be resolved per request, never
 *     cached on the session).
 *
 * Throws `NotFoundError` (404) for non-members (existence-hiding, via `assertWorkspaceAccess`),
 * `ForbiddenError` (403) for out-of-scope containers or (when `mutating`) read-only grants.
 *
 * A `workspace`/`read_write` member (every pre-THOTH-042 owner) is unaffected: `scopeType ===
 * 'workspace'` short-circuits `assertGrantAllowsContainer`, and `assertGrantAllowsWrite` passes
 * for `read_write` — so existing single-owner workspaces behave byte-for-byte as before.
 */
export async function assertContentAccess(
  session: ApiKeySession,
  container: { id: string; workspaceId: string },
  options?: { mutating?: boolean }
): Promise<void> {
  const member = await assertWorkspaceAccess(session.user.id, container.workspaceId);

  const grant: AccessGrant = session.appContext ? session.appContext.accessGrant : await memberToAccessGrant(member);

  await assertGrantAllowsContainer(grant, container);

  if (options?.mutating) {
    assertGrantAllowsWrite(grant);
  }
}
