import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { getMemberAccessGrantsByWorkspace, notificationAllowedByGrant } from '@/lib/notifications/member-workspaces';
import type { GetNotificationUnreadCountsResponse } from '@/types/api';

// Unread-count summary for the header bell (THOTH-066): a `total` plus a per-workspace
// breakdown, both scoped to the caller's *current* memberships AND current per-container
// `AccessGrant` (THOTH-042) — a reduced grant must not be reflected in an inflated unread badge.
export const GET = apiRoute<GetNotificationUnreadCountsResponse, {}, {}, {}>(
  {
    disallowApiKey: true,
  },
  async (_request, session) => {
    const notificationRepository = await getNotificationRepository();
    const grantsByWorkspaceId = await getMemberAccessGrantsByWorkspace(session.user.id);

    const rows = await notificationRepository.getByQuery(
      addUserIdToQuery(notificationRepository.createQuery(), session.user.id)
    );

    const membershipUnread = rows.filter((row) => row.readAt === null && grantsByWorkspaceId.has(row.workspaceId));
    const grantAllowed = await Promise.all(
      membershipUnread.map((row) => notificationAllowedByGrant(grantsByWorkspaceId, row))
    );
    const unread = membershipUnread.filter((_row, index) => grantAllowed[index]);

    const countsByWorkspace = new Map<string, number>();
    for (const row of unread) {
      countsByWorkspace.set(row.workspaceId, (countsByWorkspace.get(row.workspaceId) ?? 0) + 1);
    }

    return {
      total: unread.length,
      byWorkspace: [...countsByWorkspace.entries()].map(([workspaceId, count]) => ({ workspaceId, count })),
    };
  }
);
