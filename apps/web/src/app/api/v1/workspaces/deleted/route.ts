import { apiRoute } from '@/lib/api/route-wrapper';
import { getWorkspaceMemberRepository, getWorkspaceRepository } from '@/lib/database';
import { getWorkspaceDeleteGracePeriodDays } from '@/lib/database/workspace-grace-period';
import type { GetDeletedWorkspacesResponse } from '@/types/api';

// Lists the caller's soft-deleted workspaces that are still within the restore grace period, so
// the `/workspaces` "Recently deleted" UI can offer to restore them. Only workspaces the caller
// owns (has a membership row for) and that haven't yet been purged are returned.
export const GET = apiRoute<GetDeletedWorkspacesResponse, {}, {}, {}>({}, async (_request, session) => {
  const workspaceMemberRepository = await getWorkspaceMemberRepository();
  const memberships = await workspaceMemberRepository.getByQuery(
    workspaceMemberRepository.createQuery().eq('userId', session.user.id)
  );

  if (memberships.length === 0) {
    return [];
  }

  const workspaceRepository = await getWorkspaceRepository();
  const workspaces = await workspaceRepository.getByQuery(
    workspaceRepository.createQuery().in(
      'id',
      memberships.map((membership) => membership.workspaceId)
    )
  );

  const gracePeriodDays = await getWorkspaceDeleteGracePeriodDays();
  const now = Date.now();

  return (
    workspaces
      .filter((workspace) => Boolean(workspace.deletedAt))
      .map((workspace) => {
        const deletedAtMs = Date.parse(workspace.deletedAt as string);
        const expiresAtMs = deletedAtMs + gracePeriodDays * 24 * 60 * 60 * 1000;
        const daysRemaining = Math.max(0, Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000)));
        return {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          deletedAt: workspace.deletedAt as string,
          daysRemaining,
        };
      })
      // Only surface workspaces still restorable (grace period not yet elapsed).
      .filter((workspace) => workspace.daysRemaining > 0)
  );
});
