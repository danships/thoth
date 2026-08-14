import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { addUserIdToQuery } from '@/lib/database/helpers';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { getMemberWorkspaceIds } from '@/lib/notifications/member-workspaces';
import type { NotificationsReadAllBody, NotificationsReadAllResponse } from '@/types/api';
import { notificationsReadAllBodySchema } from '@/types/api';

// Bounded per-iteration write cap so a very large inbox can't be rewritten in one unbounded
// pass (mirrors `FILE_USAGE_RECONCILE_BATCH_SIZE`). The loop keeps going until every currently
// unread row has been marked read.
const READ_ALL_BATCH_SIZE = 200;

// Mark every unread item for the caller read (THOTH-066), optionally scoped to one workspace
// (membership-checked). Runs in bounded batches and returns the number of rows updated.
export const POST = apiRoute<NotificationsReadAllResponse, {}, {}, NotificationsReadAllBody>(
  {
    disallowApiKey: true,
    expectedBodySchema: notificationsReadAllBodySchema,
  },
  async ({ body }, session) => {
    const notificationRepository = await getNotificationRepository();

    let allowedWorkspaceIds: Set<string>;
    if (body.workspaceId) {
      await assertWorkspaceAccess(session.user.id, body.workspaceId);
      allowedWorkspaceIds = new Set([body.workspaceId]);
    } else {
      allowedWorkspaceIds = await getMemberWorkspaceIds(session.user.id);
    }

    const baseQuery = addUserIdToQuery(notificationRepository.createQuery(), session.user.id);
    if (body.workspaceId) {
      baseQuery.eq('workspaceId', body.workspaceId);
    }
    const rows = await notificationRepository.getByQuery(baseQuery);

    const unread = rows.filter((row) => row.readAt === null && allowedWorkspaceIds.has(row.workspaceId));

    let updated = 0;
    for (let start = 0; start < unread.length; start += READ_ALL_BATCH_SIZE) {
      const batch = unread.slice(start, start + READ_ALL_BATCH_SIZE);
      for (const row of batch) {
        const readAt = new Date().toISOString();
        await notificationRepository.update({ ...row, readAt });
        updated += 1;
      }
    }

    return { updated };
  }
);
