import { z } from 'zod';
import type { DataWrapper } from '../utilities';

// Public, per-recipient inbox item shape (THOTH-066). Never exposes the internal `sourceJobId`
// idempotency key or the raw actor user id (only `actorType`/`actorAppId` are surfaced). The
// `title`/`body` are the frozen strings rendered at dispatch time; `openUrl` is the server
// navigation route that marks the item read and redirects to the page.
export const notificationResponseSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    containerId: z.string(),
    event: z.enum(['page.created', 'page.updated']),
    actorType: z.enum(['user', 'app']),
    actorAppId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    changeCount: z.number().int().min(0),
    readAt: z.string().nullable(),
    occurredAt: z.string(),
    createdAt: z.string(),
    openUrl: z.string(),
  })
  .meta({ id: 'Notification' });
export type NotificationResponse = z.infer<typeof notificationResponseSchema>;
export type NotificationResponseData = DataWrapper<NotificationResponse>;

/** GET /notifications */
export const getNotificationsQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true')
    .default(false),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;

export const getNotificationsResponseSchema = z.object({
  notifications: z.array(notificationResponseSchema),
});
export type GetNotificationsResponse = z.infer<typeof getNotificationsResponseSchema>;
export type GetNotificationsResponseData = DataWrapper<GetNotificationsResponse>;

export const getNotificationsPaginationSchema = z.object({
  nextCursor: z.string().nullable(),
});
export type GetNotificationsPagination = z.infer<typeof getNotificationsPaginationSchema>;

/** GET /notifications/unread-counts */
export const getNotificationUnreadCountsResponseSchema = z.object({
  total: z.number().int().min(0),
  byWorkspace: z.array(
    z.object({
      workspaceId: z.string(),
      count: z.number().int().min(0),
    })
  ),
});
export type GetNotificationUnreadCountsResponse = z.infer<typeof getNotificationUnreadCountsResponseSchema>;
export type GetNotificationUnreadCountsResponseData = DataWrapper<GetNotificationUnreadCountsResponse>;

/** PATCH /notifications/{id} */
export const patchNotificationParametersSchema = z.object({
  id: z.string().min(1),
});
export type PatchNotificationParameters = z.infer<typeof patchNotificationParametersSchema>;

export const patchNotificationBodySchema = z.object({
  read: z.boolean(),
});
export type PatchNotificationBody = z.infer<typeof patchNotificationBodySchema>;

export const patchNotificationResponseSchema = notificationResponseSchema;
export type PatchNotificationResponse = z.infer<typeof patchNotificationResponseSchema>;
export type PatchNotificationResponseData = DataWrapper<PatchNotificationResponse>;

/** POST /notifications/read-all */
export const notificationsReadAllBodySchema = z.object({
  workspaceId: z.string().min(1).optional(),
});
export type NotificationsReadAllBody = z.infer<typeof notificationsReadAllBodySchema>;

export const notificationsReadAllResponseSchema = z.object({
  updated: z.number().int().min(0),
});
export type NotificationsReadAllResponse = z.infer<typeof notificationsReadAllResponseSchema>;
export type NotificationsReadAllResponseData = DataWrapper<NotificationsReadAllResponse>;
