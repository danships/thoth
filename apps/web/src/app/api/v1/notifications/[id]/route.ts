import { apiRoute } from '@/lib/api/route-wrapper';
import { getNotificationRepository } from '@/lib/database';
import { assertWorkspaceAccess } from '@/lib/api/server/workspace-access';
import { memberToAccessGrant, grantAllowsContainer } from '@/lib/auth/access-grant';
import { NotFoundError } from '@/lib/errors/not-found-error';
import { toNotificationResponse } from '@/lib/notifications/notification-response';
import type { PatchNotificationBody, PatchNotificationParameters, PatchNotificationResponse } from '@/types/api';
import { patchNotificationBodySchema, patchNotificationParametersSchema } from '@/types/api';

// Mark a single inbox item read/unread (THOTH-066). Ownership, current membership, AND the
// caller's current per-container `AccessGrant` (THOTH-042) are all required — any failing
// returns 404 (never 403) so the item's existence is never leaked.
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
    const member = await assertWorkspaceAccess(session.user.id, notification.workspaceId);

    // The caller's scope can also have been reduced since the item was created — re-check the
    // *current* grant against the notification's target container (404 existence-hiding, same
    // as the membership check above).
    const grant = await memberToAccessGrant(member);
    const allowed = await grantAllowsContainer(grant, {
      id: notification.containerId,
      workspaceId: notification.workspaceId,
    });
    if (!allowed) {
      throw new NotFoundError('Notification not found');
    }

    const desiredReadAt = body.read ? (notification.readAt ?? new Date().toISOString()) : null;

    if (desiredReadAt === notification.readAt) {
      return toNotificationResponse(notification);
    }

    const updated = await notificationRepository.update({ ...notification, readAt: desiredReadAt });
    return toNotificationResponse(updated);
  }
);
