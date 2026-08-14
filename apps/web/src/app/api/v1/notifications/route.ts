import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getMemberAccessGrantsByWorkspace, notificationAllowedByGrant } from '@/lib/notifications/member-workspaces';
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
// caller's *current* memberships AND their current per-container `AccessGrant` (THOTH-042), so a
// revoked-membership row, and a row whose target container has since fallen outside a reduced
// grant, never leak. Ordered `(occurredAt DESC, id DESC)` with a compound base64 cursor.
//
// NOTE: `workspaceId`/`userId` are pushed down into the repository query (SuperSave supports
// `eq` at the query level); `unreadOnly`/cursor/grant filtering stay in application code because
// SuperSave has no reliable `IS NULL`/keyset-range/async-predicate query support (see
// `packages/database`'s own documented limitation for nullable-field filters).
export const GET = apiRoute<GetNotificationsResponse, GetNotificationsQuery, {}, {}>(
  {
    disallowApiKey: true,
    expectedQuerySchema: getNotificationsQuerySchema,
  },
  async ({ query, setResponseMeta }, session) => {
    const notificationRepository = await getNotificationRepository();

    const grantsByWorkspaceId = await getMemberAccessGrantsByWorkspace(session.user.id);
    if (query.workspaceId) {
      // Membership check (404 existence-hiding for non-members) before scoping to it.
      await assertWorkspaceAccess(session.user.id, query.workspaceId);
    }

    const baseQuery = addUserIdToQuery(notificationRepository.createQuery(), session.user.id);
    if (query.workspaceId) {
      baseQuery.eq('workspaceId', query.workspaceId);
    }
    const rows = await notificationRepository.getByQuery(baseQuery);

    const cursor = query.cursor ? decodeNotificationCursor(query.cursor) : undefined;

    const membershipFiltered = rows
      .filter((row) => grantsByWorkspaceId.has(row.workspaceId))
      .filter((row) => (query.unreadOnly ? row.readAt === null : true))
      .filter((row) => (cursor ? isAfterCursor(row, cursor) : true))
      .toSorted(compareNotificationsDesc);

    const grantAllowed = await Promise.all(
      membershipFiltered.map((row) => notificationAllowedByGrant(grantsByWorkspaceId, row))
    );
    const filtered = membershipFiltered.filter((_row, index) => grantAllowed[index]);

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
