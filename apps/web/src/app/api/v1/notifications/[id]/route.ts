import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { toNotificationResponse } from '@/lib/notifications/notification-response';
import type { PatchNotificationBody, PatchNotificationParameters, PatchNotificationResponse } from '@/types/api';
import { patchNotificationBodySchema, patchNotificationParametersSchema } from '@/types/api';

// Mark a single inbox item read/unread (THOTH-066). Ownership *and* current membership are both
// required — either failing returns 404 (never 403) so the item's existence is never leaked.
// Idempotent: re-marking an already-read item just returns it unchanged.
export const PATCH = apiRoute<PatchNotificationResponse, {}, PatchNotificationParameters, PatchNotificationBody>(
  {
    disallowApiKey: true,
    expectedParamsSchema: patchNotificationParametersSchema,
    expectedBodySchema: patchNotificationBodySchema,
  },
  async ({ params, body }, session) => {
    const notificationRepository = await getNotificationRepository();
    const notification = await notificationRepository.getOneByQuery(
      notificationRepository.createQuery().eq('id', params.id)
    );

    if (!notification || notification.userId !== session.user.id) {
      throw new NotFoundError('Notification not found');
    }

    // Membership can be revoked after the item was created — re-check (404 existence-hiding).
    await assertWorkspaceAccess(session.user.id, notification.workspaceId);

    const desiredReadAt = body.read ? (notification.readAt ?? new Date().toISOString()) : null;

    if (desiredReadAt === notification.readAt) {
      return toNotificationResponse(notification);
    }

    const updated = await notificationRepository.update({ ...notification, readAt: desiredReadAt });
    return toNotificationResponse(updated);
  }
);
