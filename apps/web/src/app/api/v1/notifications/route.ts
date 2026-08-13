import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getMemberWorkspaceIds } from '@/lib/notifications/member-workspaces';
import {
  compareNotificationsDesc,
  decodeNotificationCursor,
  encodeNotificationCursor,
  isAfterCursor,
  toNotificationResponse,
} from '@/lib/notifications/notification-response';
import type { GetNotificationsQuery, GetNotificationsResponse } from '@/types/api';
import { getNotificationsQuerySchema } from '@/types/api';

// Personal inbox listing (THOTH-066). Notifications are PER-USER state, so scoped by
// `userId` (never workspace-content rules) — but every row is additionally intersected with the
// caller's *current* memberships so a revoked-membership row never leaks. Ordered
// `(occurredAt DESC, id DESC)` with a compound base64 cursor.
export const GET = apiRoute<GetNotificationsResponse, GetNotificationsQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: getNotificationsQuerySchema,
  },
  async ({ query, setResponseMeta }, session) => {
    const notificationRepository = await getNotificationRepository();

    let allowedWorkspaceIds: Set<string> | undefined;
    if (query.workspaceId) {
      // Membership check (404 existence-hiding for non-members) before scoping to it.
      await assertWorkspaceAccess(session.user.id, query.workspaceId);
      allowedWorkspaceIds = new Set([query.workspaceId]);
    } else {
      allowedWorkspaceIds = await getMemberWorkspaceIds(session.user.id);
    }

    const baseQuery = addUserIdToQuery(notificationRepository.createQuery(), session.user.id);
    if (query.workspaceId) {
      baseQuery.eq('workspaceId', query.workspaceId);
    }
    const rows = await notificationRepository.getByQuery(baseQuery);

    const cursor = query.cursor ? decodeNotificationCursor(query.cursor) : undefined;

    const filtered = rows
      .filter((row) => allowedWorkspaceIds.has(row.workspaceId))
      .filter((row) => (query.unreadOnly ? row.readAt === null : true))
      .filter((row) => (cursor ? isAfterCursor(row, cursor) : true))
      .toSorted(compareNotificationsDesc);

    const page = filtered.slice(0, query.limit);
    const hasMore = filtered.length > query.limit;
    const last = page.at(-1);

    setResponseMeta({
      pagination: {
        nextCursor: hasMore && last ? encodeNotificationCursor({ occurredAt: last.occurredAt, id: last.id }) : null,
      },
    });

    return {
      notifications: page.map((row) => toNotificationResponse(row)),
    };
  }
);
